/**
 * Dev/auth placeholder for /v1/me routes.
 * Resolves current user from X-User-Id, X-User-Email, or DEV_USER_ID / first user in DB.
 * Production would resolve from session/JWT.
 */
import { postgresPool } from '../db/postgres.js';

export async function authMe(req, res, next) {
  try {
    const headerId = req.get('X-User-Id');
    const headerEmail = req.get('X-User-Email');
    const devUserId = process.env.DEV_USER_ID;

    let user = null;

    if (headerId) {
      const r = await postgresPool.query(
        'SELECT id, email, name, role, organization_id FROM users WHERE id = $1',
        [headerId]
      );
      user = r.rows[0] ?? null;
    }
    if (!user && headerEmail) {
      const r = await postgresPool.query(
        'SELECT id, email, name, role, organization_id FROM users WHERE email = $1',
        [headerEmail]
      );
      user = r.rows[0] ?? null;
    }
    if (!user && devUserId) {
      const r = await postgresPool.query(
        'SELECT id, email, name, role, organization_id FROM users WHERE id = $1',
        [devUserId]
      );
      user = r.rows[0] ?? null;
    }
    if (!user) {
      const r = await postgresPool.query(
        'SELECT id, email, name, role, organization_id FROM users LIMIT 1'
      );
      user = r.rows[0] ?? null;
    }

    if (!user) {
      return res.status(401).json({ error: 'No user found. Seed users or set DEV_USER_ID.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organization_id: user.organization_id,
    };
    next();
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
