import { Router } from 'express';
import { getEntityById } from '../services/entityService.js';
import { getEntityTimeline } from '../services/timelineService.js';
import { getEntityBrief } from '../services/entityBriefService.js';

export const entitiesRouter = Router();

// Must be before /:id so that /:entityId/brief and /:entityId/timeline are matched
entitiesRouter.get('/:entityId/brief', async (req, res) => {
  try {
    const brief = await getEntityBrief(req.params.entityId);
    if (!brief) return res.status(404).json({ error: 'Entity not found' });
    res.json(brief);
  } catch (err) {
    console.error('[entity brief] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

entitiesRouter.get('/:entityId/timeline', async (req, res) => {
  try {
    const timeline = await getEntityTimeline(req.params.entityId);
    if (!timeline) return res.status(400).json({ error: 'entityId required' });
    res.json(timeline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
