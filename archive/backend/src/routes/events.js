import { Router } from 'express';
import { getRiskEvents } from '../services/riskEventsService.js';

export const eventsRouter = Router();

eventsRouter.get('/', async (req, res) => {
  try {
    const {
      program,
      severity,
      event_type,
      state,
      limit = 50,
      offset = 0,
    } = req.query;
    const data = await getRiskEvents({
      program: program || undefined,
      severity: severity || undefined,
      event_type: event_type || undefined,
      state: state || undefined,
      limit: Math.min(100, parseInt(limit, 10) || 50),
      offset: Math.max(0, parseInt(offset, 10) || 0),
    });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
