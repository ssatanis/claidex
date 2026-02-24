/**
 * GET /v1/providers/:npi/financials
 *
 * Returns HCRIS facility-level financials for the given NPI (hospitals and SNFs),
 * with peer medians and margin percentile by facility_type + state.
 */

import { Router } from 'express';
import { getFinancialsByNpi } from '../services/financialService.js';

export const financialsRouter = Router();

financialsRouter.get('/:npi/financials', async (req, res) => {
  try {
    let { npi } = req.params;
    npi = String(npi).trim();
    if (!/^\d{9,10}$/.test(npi)) {
      return res.status(400).json({ error: 'NPI must be a 9- or 10-digit number' });
    }
    npi = npi.padStart(10, '0');

    const result = await getFinancialsByNpi(npi);
    if (!result) {
      return res.status(404).json({ error: 'No HCRIS financials found for this NPI' });
    }

    res.json(result);
  } catch (err) {
    console.error('[financials] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
