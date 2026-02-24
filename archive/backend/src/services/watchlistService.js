import { postgresPool } from '../db/postgres.js';

const VALID_TYPES = ['provider', 'entity'];

/**
 * Validate type and id format. Returns { valid: boolean, error?: string }.
 */
export function validateWatchlistInput({ type, id }) {
  if (!type || !VALID_TYPES.includes(type)) {
    return { valid: false, error: 'type must be "provider" or "entity"' };
  }
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'id is required' };
  }
  const entityId = String(id).trim();
  if (type === 'provider') {
    if (!/^\d{10}$/.test(entityId)) {
      return { valid: false, error: 'id must be a 10-digit NPI for type provider' };
    }
  } else {
    if (entityId.length === 0) {
      return { valid: false, error: 'entity id cannot be empty' };
    }
  }
  return { valid: true, entityId };
}

/**
 * Add or get existing watchlist entry (upsert by type, entity_id, email).
 * email must be non-empty.
 */
export async function addToWatchlist({ type, id, email }) {
  const validation = validateWatchlistInput({ type, id });
  if (!validation.valid) {
    const err = new Error(validation.error);
    err.code = 'VALIDATION';
    throw err;
  }
  const entityId = validation.entityId;
  const emailTrimmed = typeof email === 'string' ? email.trim() : '';
  if (!emailTrimmed) {
    const err = new Error('email is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const client = await postgresPool.connect();
  try {
    const result = await client.query(
      `INSERT INTO watchlist (type, entity_id, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (type, entity_id, email) DO UPDATE SET type = watchlist.type
       RETURNING id, type, entity_id, email, created_at, last_notified_at`,
      [type, entityId, emailTrimmed]
    );
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Get all watchlist entries for an email, optionally filtered by type and/or entity_id.
 */
export async function getWatchlist({ email, type, entity_id }) {
  if (!email || (typeof email === 'string' && !email.trim())) {
    const err = new Error('email is required');
    err.code = 'VALIDATION';
    throw err;
  }
  const emailTrimmed = String(email).trim();
  const client = await postgresPool.connect();
  try {
    const conditions = ['email = $1'];
    const params = [emailTrimmed];
    let n = 2;
    if (type && VALID_TYPES.includes(type)) {
      conditions.push(`type = $${n++}`);
      params.push(type);
    }
    if (entity_id != null && String(entity_id).trim() !== '') {
      conditions.push(`entity_id = $${n++}`);
      params.push(String(entity_id).trim());
    }
    const r = await client.query(
      `SELECT id, type, entity_id, email, created_at, last_notified_at
       FROM watchlist
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC`,
      params
    );
    return r.rows.map(mapRow);
  } finally {
    client.release();
  }
}

/**
 * Delete watchlist entry by primary key id.
 */
export async function deleteWatchlistById(id) {
  const parsed = parseInt(id, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    const err = new Error('Invalid watchlist id');
    err.code = 'VALIDATION';
    throw err;
  }
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      'DELETE FROM watchlist WHERE id = $1 RETURNING id',
      [parsed]
    );
    return r.rowCount > 0;
  } finally {
    client.release();
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    entity_id: row.entity_id,
    email: row.email,
    created_at: row.created_at,
    last_notified_at: row.last_notified_at,
  };
}
