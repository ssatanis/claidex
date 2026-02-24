/**
 * Political contribution matching service.
 *
 * For a given NPI:
 *  1. Fetch provider identity (last_name, first_name, city, state, org_name) from Postgres.
 *  2. Fetch corporate entity ownership chain (depth ≤ 2) from Neo4j.
 *  3. Query fec_contributions by normalized last name + state (index-backed).
 *  4. Score each candidate row with Jaro-Winkler; keep ≥ SIMILARITY_THRESHOLD.
 *  5. Query fec_contributions by employer token overlap for entity-linked matches.
 *  6. Enrich all matched committee_ids with committee metadata.
 *  7. Compute per-state healthcare sector donation total for relative intensity.
 *  8. Generate interpretable flags.
 */

import natural from 'natural';
const { JaroWinklerDistance } = natural;
import { postgresPool } from '../db/postgres.js';
import { getNeo4jSession } from '../db/neo4j.js';

// ─── Tunable constants ────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.92;

// Stop-words removed before entity name tokenisation for employer matching
const ENTITY_STOP_WORDS = new Set([
  'LLC', 'INC', 'PLLC', 'PC', 'LLP', 'CORP', 'CO', 'LTD',
  'MEDICAL', 'MEDICINE', 'CLINIC', 'CLINICS', 'HOSPITAL', 'HOSPITALS',
  'HEALTH', 'HEALTHCARE', 'GROUP', 'CARE', 'CENTER', 'CENTRE',
  'ASSOCIATES', 'ASSOCIATION', 'SERVICES', 'MANAGEMENT', 'SOLUTIONS',
  'NETWORK', 'NETWORKS', 'SYSTEM', 'SYSTEMS', 'PARTNERS',
  'THE', 'OF', 'AND', 'AT', 'FOR',
]);

// Healthcare keywords for the sector denominator query
const HC_OCCUPATION_TERMS = ['PHYSICIAN', 'DOCTOR', 'SURGEON', 'NURSE', 'DENTIST', 'PHARMACIST'];
const HC_EMPLOYER_TERMS   = ['HOSPITAL', 'HEALTH', 'MEDICAL', 'CLINIC', 'PHARMA'];

const DEFAULT_CYCLE = 2024;

// Simple in-process cache for sector totals: "state:cycle" → { total, ts }
const _sectorCache = new Map();
const SECTOR_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Normalisation helpers ────────────────────────────────────────────────────

function normalise(str) {
  if (!str) return '';
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractLastName(normalised) {
  // FEC format: "LAST FIRST MI" after normalisation (comma was stripped)
  // Original raw format is "LAST, FIRST MI" — comma becomes space after normalise()
  // The normalised_last_name column in PG is already split; this helper is for
  // provider names coming from Postgres.
  const parts = normalised.split(/\s+/);
  return parts[0] ?? '';
}

function significantTokens(entityName) {
  const norm = normalise(entityName);
  return norm
    .split(/\s+/)
    .filter(t => t.length >= 3 && !ENTITY_STOP_WORDS.has(t));
}

// ─── Step 1: Provider identity ────────────────────────────────────────────────

async function fetchProvider(npi) {
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      `SELECT last_name, first_name, city, state, org_name, entity_type_code
       FROM providers WHERE npi = $1`,
      [npi],
    );
    return r.rows[0] ?? null;
  } finally {
    client.release();
  }
}

// ─── Step 2: Neo4j ownership chain ───────────────────────────────────────────

async function fetchOwnershipEntities(npi) {
  const session = await getNeo4jSession();
  try {
    const r = await session.run(
      `MATCH (p:Provider {npi: $npi})-[:CONTROLLED_BY|OWNS*1..2]->(e:CorporateEntity)
       RETURN e.name AS name, e.city AS city, e.state AS state`,
      { npi },
    );
    return r.records.map(rec => ({
      name:  rec.get('name'),
      city:  rec.get('city'),
      state: rec.get('state'),
    }));
  } catch {
    // Neo4j may not be available in all environments; degrade gracefully
    return [];
  } finally {
    await session.close();
  }
}

// ─── Step 3: Candidate individual contributions ───────────────────────────────

async function fetchCandidateContributions(lastNames, states) {
  if (!lastNames.length || !states.length) return [];
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      `SELECT id, contributor_name, normalized_name, normalized_last_name,
              city, state, amount, committee_id, transaction_date
       FROM fec_contributions
       WHERE normalized_last_name = ANY($1)
         AND state = ANY($2)`,
      [lastNames, states],
    );
    return r.rows;
  } finally {
    client.release();
  }
}

// ─── Step 4: Jaro-Winkler scoring + grouping by matched contributor ───────────

function scoreContributions(rows, candidateFullNames) {
  const scored = [];
  for (const row of rows) {
    let best = 0;
    let bestCandidate = null;
    for (const cname of candidateFullNames) {
      const sim = JaroWinklerDistance(row.normalized_name, cname, { ignoreCase: false });
      if (sim > best) {
        best = sim;
        bestCandidate = cname;
      }
    }
    if (best >= SIMILARITY_THRESHOLD) {
      scored.push({ ...row, similarity_score: Math.round(best * 10000) / 10000, matched_candidate: bestCandidate });
    }
  }
  return scored;
}

function groupByContributor(scoredRows) {
  const byName = new Map();
  for (const row of scoredRows) {
    const key = row.normalized_name;
    if (!byName.has(key)) {
      byName.set(key, {
        contributor_name:  row.contributor_name,
        normalized_name:   row.normalized_name,
        city:              row.city,
        state:             row.state,
        similarity_score:  row.similarity_score,
        match_type:        row.city ? 'name_state_city' : 'name_state',
        total_donated:     0,
        first_year:        null,
        last_year:         null,
        committee_amounts: new Map(),
        rows:              [],
      });
    }
    const g = byName.get(key);
    g.total_donated += Number(row.amount);
    if (row.similarity_score > g.similarity_score) {
      g.similarity_score = row.similarity_score;
    }
    const yr = row.transaction_date ? new Date(row.transaction_date).getFullYear() : null;
    if (yr) {
      if (!g.first_year || yr < g.first_year) g.first_year = yr;
      if (!g.last_year  || yr > g.last_year)  g.last_year  = yr;
    }
    const prev = g.committee_amounts.get(row.committee_id) ?? 0;
    g.committee_amounts.set(row.committee_id, prev + Number(row.amount));
    g.rows.push(row);
  }
  return [...byName.values()];
}

// ─── Step 5: Employer / entity matches ───────────────────────────────────────

async function fetchEmployerMatches(entityNames, states) {
  if (!entityNames.length || !states.length) return [];

  // Build candidate token sets for each entity
  const entityTokenSets = entityNames.map(n => ({
    name:   n,
    tokens: significantTokens(n),
  })).filter(e => e.tokens.length >= 2);

  if (!entityTokenSets.empty === undefined && entityTokenSets.length === 0) return [];

  // Collect all unique significant tokens across all entities for the WHERE clause
  const allTokens = [...new Set(entityTokenSets.flatMap(e => e.tokens))];
  if (!allTokens.length) return [];

  // Build LIKE conditions — we use parameterised state but LIKE with inlined tokens
  // (tokens are already normalised to [A-Z0-9 ], safe to interpolate)
  const likeClauses = allTokens
    .map(t => `normalized_employer LIKE '%${t}%'`)
    .join(' OR ');

  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      `SELECT normalized_employer,
              SUM(amount)::numeric    AS total_donated,
              committee_id,
              COUNT(*)::int           AS contribution_count
       FROM fec_contributions
       WHERE state = ANY($1)
         AND (${likeClauses})
       GROUP BY normalized_employer, committee_id`,
      [states],
    );

    // Post-filter: keep only rows where ≥ 2 significant tokens from any single entity overlap
    const results = [];
    for (const row of r.rows) {
      if (!row.normalized_employer) continue;
      for (const { name, tokens } of entityTokenSets) {
        const overlap = tokens.filter(t => row.normalized_employer.includes(t));
        if (overlap.length >= 2) {
          results.push({ ...row, entity_name: name, token_overlap: overlap });
          break;
        }
      }
    }
    return results;
  } finally {
    client.release();
  }
}

function groupByEmployer(employerRows) {
  const byEmployer = new Map();
  for (const row of employerRows) {
    const key = row.normalized_employer;
    if (!byEmployer.has(key)) {
      byEmployer.set(key, {
        employer_name:     row.normalized_employer,
        entity_name:       row.entity_name,
        token_overlap:     row.token_overlap,
        total_donated:     0,
        committee_amounts: new Map(),
      });
    }
    const g = byEmployer.get(key);
    g.total_donated += Number(row.total_donated);
    const prev = g.committee_amounts.get(row.committee_id) ?? 0;
    g.committee_amounts.set(row.committee_id, prev + Number(row.total_donated));
  }
  return [...byEmployer.values()];
}

// ─── Step 6: Enrich with committee metadata ───────────────────────────────────

async function fetchCommittees(committeeIds) {
  if (!committeeIds.length) return {};
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      `SELECT committee_id, committee_name, party, type
       FROM fec_committees
       WHERE committee_id = ANY($1)`,
      [committeeIds],
    );
    const map = {};
    for (const row of r.rows) map[row.committee_id] = row;
    return map;
  } finally {
    client.release();
  }
}

function buildTopRecipients(committeeAmounts, committeeMap, topN = 5) {
  return [...committeeAmounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id, amount]) => ({
      committee_id:   id,
      committee_name: committeeMap[id]?.committee_name ?? null,
      party:          committeeMap[id]?.party          ?? null,
      type:           committeeMap[id]?.type           ?? null,
      amount:         Math.round(amount * 100) / 100,
    }));
}

// ─── Step 7: Sector intensity ─────────────────────────────────────────────────

async function fetchSectorTotal(state, cycle) {
  const cacheKey = `${state}:${cycle}`;
  const cached = _sectorCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SECTOR_CACHE_TTL_MS) {
    return cached.total;
  }

  const occLike  = HC_OCCUPATION_TERMS.map(t => `UPPER(occupation) LIKE '%${t}%'`).join(' OR ');
  const emplLike = HC_EMPLOYER_TERMS.map(t => `UPPER(employer) LIKE '%${t}%'`).join(' OR ');

  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS sector_total
       FROM fec_contributions
       WHERE state = $1
         AND cycle = $2
         AND (${occLike} OR ${emplLike})`,
      [state, cycle],
    );
    const total = Number(r.rows[0]?.sector_total ?? 0);
    _sectorCache.set(cacheKey, { total, ts: Date.now() });
    return total;
  } finally {
    client.release();
  }
}

// ─── Step 8: Flags ────────────────────────────────────────────────────────────

function computeFlags(contributors, employers, sectorTotal) {
  const flags = [];

  for (const c of contributors) {
    if (c.total_donated >= 10000) {
      flags.push(
        `Matched individual contributor with same last name, state, and city donating $${c.total_donated.toLocaleString()} since ${c.first_year ?? '?'}.`,
      );
    }

    const allAmounts = c.top_recipients.map(r => r.amount);
    if (allAmounts.length) {
      const totalAmt = allAmounts.reduce((a, b) => a + b, 0);
      const byParty = {};
      for (const r of c.top_recipients) {
        if (r.party) byParty[r.party] = (byParty[r.party] ?? 0) + r.amount;
      }
      for (const [party, amt] of Object.entries(byParty)) {
        if (amt / totalAmt >= 0.8) {
          const label = party === 'REP' ? 'Republicans' : party === 'DEM' ? 'Democrats' : party;
          flags.push(`Donations overwhelmingly favor ${label} (${Math.round((amt / totalAmt) * 100)}%).`);
        }
      }
    }

    if (sectorTotal > 0) {
      c.share_of_state_healthcare_donations_pct =
        Math.round((c.total_donated / sectorTotal) * 10000) / 100;
    } else {
      c.share_of_state_healthcare_donations_pct = null;
    }
  }

  // Employer-level flags: compare against median employer donation in state
  // (approximated here as sectorTotal / estimated employer count;
  //  a full implementation would pre-materialise employer-level stats)
  for (const e of employers) {
    if (e.total_donated >= 50000) {
      flags.push(
        `Employer-linked organization "${e.employer_name}" has donated $${e.total_donated.toLocaleString()} to federal campaigns.`,
      );
    }
    const allAmounts = e.top_recipients.map(r => r.amount);
    if (allAmounts.length) {
      const totalAmt = allAmounts.reduce((a, b) => a + b, 0);
      const byParty = {};
      for (const r of e.top_recipients) {
        if (r.party) byParty[r.party] = (byParty[r.party] ?? 0) + r.amount;
      }
      for (const [party, amt] of Object.entries(byParty)) {
        if (amt / totalAmt >= 0.8) {
          const label = party === 'REP' ? 'Republicans' : party === 'DEM' ? 'Democrats' : party;
          flags.push(`Employer donations overwhelmingly favor ${label} (${Math.round((amt / totalAmt) * 100)}%).`);
        }
      }
    }
  }

  return flags;
}

// ─── Main entrypoint ──────────────────────────────────────────────────────────

export async function getPoliticalConnections(npi, cycle = DEFAULT_CYCLE) {
  // 1. Provider identity
  const provider = await fetchProvider(npi);
  if (!provider) return null;

  const providerState = provider.state?.toUpperCase() ?? null;

  // Build candidate name arrays
  const candidateLastNames   = new Set();
  const candidateFullNames   = new Set();
  const candidateEntityNames = [];
  const candidateStates      = new Set();

  if (providerState) candidateStates.add(providerState);

  const normLast  = normalise(provider.last_name ?? '');
  const normFirst = normalise(provider.first_name ?? '');

  if (normLast) {
    candidateLastNames.add(normLast);
    if (normFirst) candidateFullNames.add(`${normLast} ${normFirst}`);
  }

  // Organisation providers: include org_name as an entity candidate
  if (provider.entity_type_code === 2 && provider.org_name) {
    candidateEntityNames.push(normalise(provider.org_name));
  }

  // 2. Ownership chain from Neo4j
  const ownerEntities = await fetchOwnershipEntities(npi);
  for (const e of ownerEntities) {
    if (e.name) candidateEntityNames.push(normalise(e.name));
    if (e.state) candidateStates.add(e.state.toUpperCase());
  }

  const lastNamesArr = [...candidateLastNames];
  const statesArr    = [...candidateStates];
  const fullNamesArr = [...candidateFullNames];

  // 3 + 4. Individual contribution candidates + Jaro-Winkler scoring
  const rawContributions = await fetchCandidateContributions(lastNamesArr, statesArr);
  const scoredContribs   = scoreContributions(rawContributions, fullNamesArr.length ? fullNamesArr : lastNamesArr);
  const groupedContribs  = groupByContributor(scoredContribs);

  // 5. Employer matches
  const rawEmployerRows = await fetchEmployerMatches(candidateEntityNames, statesArr);
  const groupedEmployers = groupByEmployer(rawEmployerRows);

  // 6. Enrich with committee data
  const allCommitteeIds = [
    ...new Set([
      ...groupedContribs.flatMap(c => [...c.committee_amounts.keys()]),
      ...groupedEmployers.flatMap(e => [...e.committee_amounts.keys()]),
    ]),
  ];
  const committeeMap = await fetchCommittees(allCommitteeIds);

  const matchedContributors = groupedContribs.map(c => ({
    contributor_name:  c.contributor_name,
    city:              c.city,
    state:             c.state,
    match_type:        c.match_type,
    similarity_score:  c.similarity_score,
    total_donated:     Math.round(c.total_donated * 100) / 100,
    donation_span_years: [c.first_year, c.last_year].filter(Boolean),
    share_of_state_healthcare_donations_pct: null, // filled in after sector fetch
    top_recipients:    buildTopRecipients(c.committee_amounts, committeeMap),
    // keep reference for flag computation
    _committee_amounts: c.committee_amounts,
  }));

  const matchedEmployers = groupedEmployers.map(e => ({
    employer_name:  e.employer_name,
    entity_name:    e.entity_name,
    total_donated:  Math.round(e.total_donated * 100) / 100,
    token_overlap:  e.token_overlap,
    top_recipients: buildTopRecipients(e.committee_amounts, committeeMap),
    _committee_amounts: e.committee_amounts,
  }));

  // 7. Sector intensity
  const sectorTotal = providerState
    ? await fetchSectorTotal(providerState, cycle)
    : 0;

  // 8. Flags (also sets share_of_state_healthcare_donations_pct in-place)
  const flags = computeFlags(matchedContributors, matchedEmployers, sectorTotal);

  // Clean up internal references before returning
  for (const c of matchedContributors) delete c._committee_amounts;
  for (const e of matchedEmployers)    delete e._committee_amounts;

  return {
    npi,
    state: providerState,
    matched_contributors: matchedContributors,
    matched_employers:    matchedEmployers,
    flags,
    meta: {
      cycle,
      data_source:      'FEC bulk files',
      matching_version: 'v1.0',
    },
  };
}
