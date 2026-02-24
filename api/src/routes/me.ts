import { Request, Response, NextFunction, Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import * as meService from '../services/meService';

const router = Router();

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  position: z.string().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  preferences: z.record(z.unknown()).optional(),
});

const notificationsSchema = z.object({
  email_alerts: z.boolean().optional(),
  email_digest_frequency: z.enum(['none', 'daily', 'weekly']).optional(),
  event_severity_min: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  program_filter: z.array(z.string()).optional(),
  watchlist_only: z.boolean().optional(),
});

const organizationSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  industry: z.string().optional(),
  billing_email: z.string().email().optional().or(z.literal('')),
  address_line1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});

const memberRoleSchema = z.object({ role: z.enum(['viewer', 'analyst', 'admin']) });
const apiKeyNameSchema = z.object({ name: z.string().min(1).max(255) });
const passwordSchema = z
  .object({
    current_password: z.string().min(1),
    new_password: z.string().min(8),
    confirm_password: z.string().min(1),
  })
  .refine((d) => d.new_password === d.confirm_password, { message: 'New password and confirm must match' });

function requireUser(req: Request): { id: string; email: string } {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Not authenticated', 401);
  return { id: req.user.id, email: req.user.email };
}

function paramId(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
}

/** GET /v1/me */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const data = await meService.getMe(id);
    if (!data) return next(AppError.notFound('User', id));
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** PATCH /v1/me/profile */
router.patch('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.invalidInput(parsed.error.errors?.[0]?.message ?? 'Invalid profile data'));
    }
    const data = await meService.updateProfile(id, parsed.data);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** PATCH /v1/me/security/password — not implemented (external auth) */
router.patch('/security/password', async (req: Request, _res: Response, next: NextFunction) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(AppError.invalidInput(parsed.error.errors?.[0]?.message ?? 'Invalid password data'));
  }
  next(new AppError('NOT_IMPLEMENTED', 'Password is managed by your identity provider. Use your provider’s security page to change it.', 501));
});

/** PATCH /v1/me/security/sessions/revoke */
router.patch('/security/sessions/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const ip = req.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? null;
    const ua = req.get('user-agent') ?? null;
    await meService.revokeSessions(id, ip ?? null, ua);
    res.json({ data: { revoked: true } });
  } catch (err) {
    next(err);
  }
});

/** GET /v1/me/security/log */
router.get('/security/log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const data = await meService.getSecurityLog(id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** GET /v1/me/notifications */
router.get('/notifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const data = await meService.getNotifications(id);
    const payload = data ?? {
      email_alerts: true,
      email_digest_frequency: 'weekly',
      event_severity_min: 'high',
      program_filter: [],
      watchlist_only: false,
    };
    res.json({ data: payload });
  } catch (err) {
    next(err);
  }
});

/** PATCH /v1/me/notifications */
router.patch('/notifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const parsed = notificationsSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.invalidInput(parsed.error.errors?.[0]?.message ?? 'Invalid notification preferences'));
    }
    const data = await meService.updateNotifications(id, parsed.data);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** GET /v1/me/organization */
router.get('/organization', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const data = await meService.getOrganization(id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** PATCH /v1/me/organization */
router.patch('/organization', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const isAdmin = await meService.isOrgAdmin(id);
    if (!isAdmin) return next(AppError.forbidden('Only organization admins can update organization settings'));
    const parsed = organizationSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.invalidInput(parsed.error.errors?.[0]?.message ?? 'Invalid organization data'));
    }
    const data = await meService.updateOrganization(id, parsed.data);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** GET /v1/me/organization/members */
router.get('/organization/members', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const data = await meService.getOrganizationMembers(id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** PATCH /v1/me/organization/members/:id */
router.patch('/organization/members/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const isAdmin = await meService.isOrgAdmin(id);
    if (!isAdmin) return next(AppError.forbidden('Only organization admins can change member roles'));
    const parsed = memberRoleSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.invalidInput(parsed.error.errors?.[0]?.message ?? 'Invalid role'));
    const memberId = paramId(req, 'id');
    const members = await meService.updateMemberRole(id, memberId, parsed.data.role);
    if (!members) return next(AppError.notFound('Member', memberId));
    res.json({ data: members });
  } catch (err) {
    next(err);
  }
});

/** DELETE /v1/me/organization/members/:id */
router.delete('/organization/members/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const isAdmin = await meService.isOrgAdmin(id);
    if (!isAdmin) return next(AppError.forbidden('Only organization admins can remove members'));
    const memberId = paramId(req, 'id');
    const ok = await meService.removeMember(id, memberId);
    if (!ok) return next(AppError.notFound('Member', memberId));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/** GET /v1/me/api-keys */
router.get('/api-keys', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const data = await meService.getApiKeys(id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** POST /v1/me/api-keys */
router.post('/api-keys', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const parsed = apiKeyNameSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.invalidInput(parsed.error.errors?.[0]?.message ?? 'Name is required'));
    }
    const data = await meService.createApiKey(id, parsed.data.name);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

/** DELETE /v1/me/api-keys/:id */
router.delete('/api-keys/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = requireUser(req);
    const keyId = paramId(req, 'id');
    const ok = await meService.revokeApiKey(id, keyId);
    if (!ok) return next(AppError.notFound('API key', keyId));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/** GET /v1/me/export */
router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, email } = requireUser(req);
    const data = await meService.exportMe(id, email);
    if (!data) return next(AppError.notFound('User', id));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="claidex-export.json"');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    next(err);
  }
});

export const meRouter = router;
