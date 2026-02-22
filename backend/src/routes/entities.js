import { Router } from 'express';
import { getEntityById } from '../services/entityService.js';

export const entitiesRouter = Router();

entitiesRouter.get('/:id', async (req, res) => {
  try {
    const entity = await getEntityById(req.params.id);
    if (!entity) return res.status(404).json({ error: 'Entity not found' });
    res.json(entity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

entitiesRouter.get('/', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    // TODO: search entities
    res.json({ results: [], total: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
