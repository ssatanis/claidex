import { Router } from 'express';
import {
  addToWatchlist,
  getWatchlist,
  deleteWatchlistById,
} from '../services/watchlistService.js';

export const watchlistRouter = Router();

/**
 * POST /v1/watchlist
 * Body: { type: 'provider'|'entity', id: string, email: string }
 * Upsert: if (type, id, email) exists, returns existing record.
 */
watchlistRouter.post('/', async (req, res) => {
  try {
    const { type, id, email } = req.body || {};
    const record = await addToWatchlist({ type, id, email });
    res.status(201).json(record);
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[watchlist] POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /v1/watchlist?email=user@example.com&type=provider&entity_id=...
 * email required; type and entity_id optional filters.
 */
watchlistRouter.get('/', async (req, res) => {
  try {
    const { email, type, entity_id } = req.query;
    const items = await getWatchlist({ email, type, entity_id });
    res.json(items);
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[watchlist] GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /v1/watchlist/:id
 * Delete by watchlist primary key.
 */
watchlistRouter.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteWatchlistById(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Watchlist entry not found' });
    }
    res.status(204).send();
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[watchlist] DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
