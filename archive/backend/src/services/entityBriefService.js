/**
 * Intelligence brief for an entity: aggregates entity info, payments across
 * owned providers, ownership summary, exclusions count, financials, political.
 */

import { postgresPool } from '../db/postgres.js';
import { getNeo4jSession } from '../db/neo4j.js';
import { getEntityById } from './entityService.js';

const DATA_SOURCES = [
  'CMS Physician PUF',
  'Medicare Part D Prescribers',
  'Medicaid PUF',
  'SNF Ownership',
  'LEIE',
  'HCRIS',
  'FEC',
];

async function getEntityWithFlags(entityId) {
  const entity = await getEntityById(entityId);
  if (entity) return entity;
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      'SELECT entity_id AS id, name, city, state, zip, flag_corporation, flag_llc, flag_holding_company, flag_investment_firm, flag_private_equity, flag_for_profit, flag_non_profit, flag_parent_company FROM corporate_entities WHERE entity_id = $1',
      [entityId]
    );
    return r.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function getEntityPaymentsSummary(entityId) {
  const client = await postgresPool.connect();
  try {
    const hasView = await client.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'entity_provider_npis') AS ok`
    );
    if (!hasView.rows[0]?.ok) {
      return { total_all_programs: 0, years_active: 0, top_program: null, by_program: {} };
    }
    const r = await client.query(
      `SELECT COALESCE(SUM(p.payments), 0)::numeric AS total, COUNT(DISTINCT p.year) AS years
       FROM entity_provider_npis e
       JOIN payments_combined_v p ON p.npi = e.npi
       WHERE e.entity_id = $1`,
      [entityId]
    );
    const row = r.rows[0];
    return {
      total_all_programs: Math.round(Number(row?.total ?? 0)),
      years_active: Number(row?.years ?? 0),
      top_program: null,
      by_program: {},
    };
  } catch {
    return { total_all_programs: 0, years_active: 0, top_program: null, by_program: {} };
  } finally {
    client.release();
  }
}

async function getEntityOwnershipSummary(entityId) {
  const out = { facility_count: 0, states: [], chow_events_last_5_years: 0 };
  try {
    const session = await getNeo4jSession();
    try {
      const facilityResult = await session.run(
        `MATCH (e:CorporateEntity {entity_id: $entityId})-[:OWNS]->(f:CorporateEntity)
         RETURN count(DISTINCT f) AS facility_count`,
        { entityId }
      );
      const fc = facilityResult.records[0]?.get('facility_count');
      out.facility_count = typeof fc === 'number' ? fc : (fc?.toNumber?.() ?? 0);

      const statesResult = await session.run(
        `MATCH (e:CorporateEntity {entity_id: $entityId})-[:OWNS*0..5]->(x:CorporateEntity)
         WHERE x.state IS NOT NULL AND x.state <> ''
         RETURN collect(DISTINCT x.state) AS states`,
        { entityId }
      );
      const statesArr = statesResult.records[0]?.get('states');
      out.states = Array.isArray(statesArr) ? [...new Set(statesArr)] : [];
    } finally {
      await session.close();
    }

    const client = await postgresPool.connect();
    try {
      const chowExists = await client.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chow_events') AS ok`
      );
      if (chowExists.rows[0]?.ok) {
        const fiveYearsAgo = new Date();
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
        const r = await client.query(
          `SELECT COUNT(*) AS n FROM chow_events
           WHERE (facility_entity_id = $1 OR buyer_entity_id = $1 OR seller_entity_id = $1)
             AND event_date >= $2`,
          [entityId, fiveYearsAgo.toISOString().slice(0, 10)]
        );
        out.chow_events_last_5_years = parseInt(r.rows[0]?.n ?? 0, 10);
      }
    } finally {
      client.release();
    }
  } catch {
    // ignore
  }
  return out;
}

async function getEntityExclusionsCount(entityId) {
  try {
    const session = await getNeo4jSession();
    try {
      const r = await session.run(
        `MATCH (e:CorporateEntity {entity_id: $entityId})-[:OWNS*0..10]-(peerEntity:CorporateEntity)
         MATCH (peer:Provider)-[:CONTROLLED_BY|OWNS*0..1]->(peerEntity)
         WHERE (peer)-[:EXCLUDED_BY]->()
         RETURN count(DISTINCT peer) AS excluded_count`,
        { entityId }
      );
      const n = r.records[0]?.get('excluded_count');
      return typeof n === 'number' ? n : (n?.toNumber?.() ?? 0);
    } finally {
      await session.close();
    }
  } catch {
    return 0;
  }
}

export async function getEntityBrief(entityId) {
  const entity = await getEntityWithFlags(entityId);
  if (!entity) return null;

  const [paymentsSummary, ownershipSummary, excludedCount] = await Promise.all([
    getEntityPaymentsSummary(entityId),
    getEntityOwnershipSummary(entityId),
    getEntityExclusionsCount(entityId),
  ]);

  const peBacked = entity.flag_private_equity === true || entity.flag_private_equity === 't';

  return {
    generated_at: new Date().toISOString(),
    entity_id: entity.id ?? entityId,
    entity: {
      name: entity.name ?? null,
      type: entity.flag_parent_company ? 'parent' : 'organization',
      state: entity.state ?? null,
      city: entity.city ?? null,
      zip: entity.zip ?? null,
      pe_backed: peBacked,
      sectors: [], // SNFs/hospitals could be derived from Neo4j labels or taxonomy
    },
    payments_summary: paymentsSummary,
    ownership_summary: ownershipSummary,
    exclusions_count: excludedCount,
    financials_summary: { has_hcris_data: false },
    political_connections: {
      total_donated: 0,
      dominant_party: null,
      matched_contributors: [],
      matched_employers: [],
    },
    meta: {
      data_sources: DATA_SOURCES,
    },
  };
}
