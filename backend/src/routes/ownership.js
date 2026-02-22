import { Router } from 'express';
import { getOwnershipGraph } from '../services/ownershipService.js';

export const ownershipRouter = Router();

ownershipRouter.get('/', async (req, res) => {
  try {
    const { npi, entityId, depth = 2 } = req.query;
    if (!npi && !entityId) {
      return res.status(400).json({ error: 'Provide npi or entityId' });
    }
    const graph = await getOwnershipGraph({ npi, entityId, depth: Number(depth) });
    res.json(graph);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
