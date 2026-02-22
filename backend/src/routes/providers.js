import { Router } from 'express';
import { getProviderByNpi } from '../services/providerService.js';

export const providersRouter = Router();

providersRouter.get('/:npi', async (req, res) => {
  try {
    const { npi } = req.params;
    const provider = await getProviderByNpi(npi);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    res.json(provider);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

providersRouter.get('/', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    // TODO: search providers by name/NPI
    res.json({ results: [], total: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
