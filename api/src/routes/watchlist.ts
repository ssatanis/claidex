import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryPg } from '../db/postgres';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';

export const watchlistRouter = Router();

// Create watchlist table if it doesn't exist
const initWatchlistTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS watchlist (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL CHECK (type IN ('provider', 'entity')),
      entity_id VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_notified_at TIMESTAMP,
      UNIQUE (type, entity_id, email)
    );

    CREATE INDEX IF NOT EXISTS idx_watchlist_email ON watchlist(email);
    CREATE INDEX IF NOT EXISTS idx_watchlist_entity ON watchlist(entity_id);
  `;

  try {
    await queryPg(createTableQuery, []);
  } catch (err) {
    console.error('[watchlist] Failed to create watchlist table:', err);
  }
};

// Initialize table on module load
initWatchlistTable().catch(console.error);

const addWatchlistSchema = z.object({
  type: z.enum(['provider', 'entity']),
  entity_id: z.string().min(1),
  email: z.string().email(),
});

const getWatchlistSchema = z.object({
  email: z.string().email(),
  type: z.enum(['provider', 'entity']).optional(),
});

/**
 * GET /v1/watchlist
 *
 * Get all watchlist items for a user
 */
watchlistRouter.get('/', validate(getWatchlistSchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const { email, type } = req.query as z.infer<typeof getWatchlistSchema>;

  try {
    let query = `
      SELECT id, type, entity_id, email, created_at, last_notified_at
      FROM watchlist
      WHERE email = $1
    `;
    const params: any[] = [email];

    if (type) {
      query += ` AND type = $2`;
      params.push(type);
    }

    query += ` ORDER BY created_at DESC`;

    const result: any = await queryPg(query, params);

    const response = {
      data: result.rows,
      meta: {
        source: 'claidex-v1',
        query_time_ms: Date.now() - startTime,
        total: result.rows.length,
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/watchlist
 *
 * Add an item to the watchlist
 */
watchlistRouter.post('/', validate(addWatchlistSchema, 'body'), async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const { type, entity_id, email } = req.body as z.infer<typeof addWatchlistSchema>;

  try {
    const query = `
      INSERT INTO watchlist (type, entity_id, email)
      VALUES ($1, $2, $3)
      ON CONFLICT (type, entity_id, email) DO UPDATE
        SET created_at = CURRENT_TIMESTAMP
      RETURNING id, type, entity_id, email, created_at, last_notified_at
    `;

    const result: any = await queryPg(query, [type, entity_id, email]);

    const response = {
      data: result.rows[0],
      meta: {
        source: 'claidex-v1',
        query_time_ms: Date.now() - startTime,
      },
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /v1/watchlist/:id
 *
 * Remove an item from the watchlist
 */
watchlistRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const { id } = req.params;

  try {
    const query = `DELETE FROM watchlist WHERE id = $1 RETURNING id`;
    const result: any = await queryPg(query, [parseInt(id as string, 10)]);

    if (result.rows.length === 0) {
      throw AppError.notFound('Watchlist item', id as string);
    }

    const response = {
      data: { deleted: true, id: parseInt(id as string, 10) },
      meta: {
        source: 'claidex-v1',
        query_time_ms: Date.now() - startTime,
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});
