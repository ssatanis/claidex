import { Router } from 'express';
import { getPoliticalConnections } from '../services/politicalService.js';
import { getProviderBrief } from '../services/providerBriefService.js';

export const politicalRouter = Router();

/**
 * GET /v1/providers/:npi/brief
 *
 * Returns a single structured intelligence brief: risk, payments, ownership,
 * exclusions, financials, political ties, and benchmark summaries.
 */
politicalRouter.get('/:npi/brief', async (req, res) => {
  try {
    const { npi } = req.params;
    if (!/^\d{10}$/.test(npi)) {
      return res.status(400).json({ error: 'NPI must be a 10-digit number' });
    }
    const brief = await getProviderBrief(npi);
    if (!brief) return res.status(404).json({ error: 'Provider not found' });
    res.json(brief);
  } catch (err) {
    console.error('[brief] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/providers/:npi/political
 *
 * Returns FEC political contribution linkages for the given NPI, including:
 *   - matched_contributors  — individual donors matched by name + state
 *   - matched_employers     — employer-linked donors matched by entity token overlap
 *   - flags                 — interpretable human-readable findings
 *   - meta                  — cycle, source, matching version
 *
 * Query params:
 *   cycle  (optional, default 2024) — FEC election cycle year
 */
politicalRouter.get('/:npi/political', async (req, res) => {
  try {
    const { npi } = req.params;
    const cycle = req.query.cycle ? parseInt(req.query.cycle, 10) : undefined;

    if (!/^\d{10}$/.test(npi)) {
      return res.status(400).json({ error: 'NPI must be a 10-digit number' });
    }
    if (cycle !== undefined && (Number.isNaN(cycle) || cycle < 2000 || cycle > 2100)) {
      return res.status(400).json({ error: 'cycle must be a valid 4-digit election year' });
    }

    const result = await getPoliticalConnections(npi, cycle);
    if (!result) return res.status(404).json({ error: 'Provider not found' });

    res.json(result);
  } catch (err) {
    console.error('[political] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
