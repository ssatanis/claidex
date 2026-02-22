import { Router } from 'express';
import { getExclusions, checkExclusion } from '../services/exclusionService.js';

export const exclusionsRouter = Router();

exclusionsRouter.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const result = await getExclusions({ search, page: Number(page), limit: Number(limit) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

exclusionsRouter.get('/check', async (req, res) => {
  try {
    const { npi, name } = req.query;
    const result = await checkExclusion({ npi, name });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
