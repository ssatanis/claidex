import { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/postgres';
import { AppError } from './errorHandler';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  organization_id: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Resolves current user for /v1/me routes.
 * Uses X-User-Id, X-User-Email, DEV_USER_ID, or first user in DB (dev only).
 * Production should resolve from session/JWT.
 */
export async function authMe(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const headerId = req.get('X-User-Id');
    const headerEmail = req.get('X-User-Email');
    const devUserId = process.env.DEV_USER_ID;
    const pool = getPool();

    let user: { id: string; email: string; name: string | null; role: string | null; organization_id: string | null } | null = null;

    if (headerId) {
      const r = await pool.query(
        'SELECT id, email, name, role, organization_id FROM users WHERE id = $1',
        [headerId]
      );
      user = r.rows[0] ?? null;
    }
    if (!user && headerEmail) {
      const r = await pool.query(
        'SELECT id, email, name, role, organization_id FROM users WHERE email = $1',
        [headerEmail]
      );
      user = r.rows[0] ?? null;
    }
    if (!user && devUserId) {
      const r = await pool.query(
        'SELECT id, email, name, role, organization_id FROM users WHERE id = $1',
        [devUserId]
      );
      user = r.rows[0] ?? null;
    }
    if (!user) {
      const r = await pool.query(
        'SELECT id, email, name, role, organization_id FROM users LIMIT 1'
      );
      user = r.rows[0] ?? null;
    }

    if (!user) {
      next(new AppError('UNAUTHORIZED', 'No user found. Seed users or set DEV_USER_ID.', 401));
      return;
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
    console.error('[authMe]', err);
    next(err);
  }
}
