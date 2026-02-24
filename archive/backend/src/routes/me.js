import { Router } from 'express';
import { z } from 'zod';
import * as meService from '../services/meService.js';

export const meRouter = Router();

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

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
const passwordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
  confirm_password: z.string().min(1),
}).refine(d => d.new_password === d.confirm_password, { message: 'New password and confirm must match' });

/** GET /v1/me */
meRouter.get('/', async (req, res) => {
  try {
    const data = await meService.getMe(req.user.id);
    if (!data) return sendError(res, 404, 'User not found');
    res.json(data);
  } catch (err) {
    console.error('[me] GET /', err);
    sendError(res, 500, 'Failed to load profile');
  }
});

/** PATCH /v1/me/profile */
meRouter.patch('/profile', async (req, res) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.errors?.[0]?.message ?? 'Invalid profile data');
    }
    const data = await meService.updateProfile(req.user.id, parsed.data);
    res.json(data);
  } catch (err) {
    console.error('[me] PATCH /profile', err);
    sendError(res, 500, 'Failed to update profile');
  }
});

/** PATCH /v1/me/security/password - not implemented (external auth) */
meRouter.patch('/security/password', async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, parsed.error.errors?.[0]?.message ?? 'Invalid password data');
  }
  return sendError(res, 501, 'Password is managed by your identity provider. Use your provider’s security page to change it.');
});

/** PATCH /v1/me/security/sessions/revoke */
meRouter.patch('/security/sessions/revoke', async (req, res) => {
  try {
    const ip = req.get('x-forwarded-for')?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    const ua = req.get('user-agent');
    await meService.revokeSessions(req.user.id, ip, ua);
    res.json({ revoked: true });
  } catch (err) {
    console.error('[me] PATCH /security/sessions/revoke', err);
    sendError(res, 500, 'Failed to revoke sessions');
  }
});

/** GET /v1/me/security/log */
meRouter.get('/security/log', async (req, res) => {
  try {
    const data = await meService.getSecurityLog(req.user.id);
    res.json(data);
  } catch (err) {
    console.error('[me] GET /security/log', err);
    sendError(res, 500, 'Failed to load security log');
  }
});

/** GET /v1/me/notifications */
meRouter.get('/notifications', async (req, res) => {
  try {
    const data = await meService.getNotifications(req.user.id);
    res.json(data ?? { email_alerts: true, email_digest_frequency: 'weekly', event_severity_min: 'high', program_filter: [], watchlist_only: false });
  } catch (err) {
    console.error('[me] GET /notifications', err);
    sendError(res, 500, 'Failed to load notifications');
  }
});

/** PATCH /v1/me/notifications */
meRouter.patch('/notifications', async (req, res) => {
  try {
    const parsed = notificationsSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.errors?.[0]?.message ?? 'Invalid notification preferences');
    }
    const data = await meService.updateNotifications(req.user.id, parsed.data);
    res.json(data);
  } catch (err) {
    console.error('[me] PATCH /notifications', err);
    sendError(res, 500, 'Failed to update notifications');
  }
});

/** GET /v1/me/organization */
meRouter.get('/organization', async (req, res) => {
  try {
    const data = await meService.getOrganization(req.user.id);
    res.json(data);
  } catch (err) {
    console.error('[me] GET /organization', err);
    sendError(res, 500, 'Failed to load organization');
  }
});

/** PATCH /v1/me/organization */
meRouter.patch('/organization', async (req, res) => {
  try {
    const isAdmin = await meService.isOrgAdmin(req.user.id);
    if (!isAdmin) return sendError(res, 403, 'Only organization admins can update organization settings');
    const parsed = organizationSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.errors?.[0]?.message ?? 'Invalid organization data');
    }
    const data = await meService.updateOrganization(req.user.id, parsed.data);
    res.json(data);
  } catch (err) {
    console.error('[me] PATCH /organization', err);
    sendError(res, 500, 'Failed to update organization');
  }
});

/** GET /v1/me/organization/members */
meRouter.get('/organization/members', async (req, res) => {
  try {
    const data = await meService.getOrganizationMembers(req.user.id);
    res.json(data);
  } catch (err) {
    console.error('[me] GET /organization/members', err);
    sendError(res, 500, 'Failed to load members');
  }
});

/** PATCH /v1/me/organization/members/:id */
meRouter.patch('/organization/members/:id', async (req, res) => {
  try {
    const isAdmin = await meService.isOrgAdmin(req.user.id);
    if (!isAdmin) return sendError(res, 403, 'Only organization admins can change member roles');
    const parsed = memberRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.errors?.[0]?.message ?? 'Invalid role');
    }
    const members = await meService.updateMemberRole(req.user.id, req.params.id, parsed.data.role);
    if (!members) return sendError(res, 404, 'Member not found');
    res.json(members);
  } catch (err) {
    console.error('[me] PATCH /organization/members/:id', err);
    sendError(res, 500, 'Failed to update member');
  }
});

/** DELETE /v1/me/organization/members/:id */
meRouter.delete('/organization/members/:id', async (req, res) => {
  try {
    const isAdmin = await meService.isOrgAdmin(req.user.id);
    if (!isAdmin) return sendError(res, 403, 'Only organization admins can remove members');
    const ok = await meService.removeMember(req.user.id, req.params.id);
    if (!ok) return sendError(res, 404, 'Member not found');
    res.status(204).send();
  } catch (err) {
    console.error('[me] DELETE /organization/members/:id', err);
    sendError(res, 500, 'Failed to remove member');
  }
});

/** GET /v1/me/api-keys */
meRouter.get('/api-keys', async (req, res) => {
  try {
    const data = await meService.getApiKeys(req.user.id);
    res.json(data);
  } catch (err) {
    console.error('[me] GET /api-keys', err);
    sendError(res, 500, 'Failed to load API keys');
  }
});

/** POST /v1/me/api-keys */
meRouter.post('/api-keys', async (req, res) => {
  try {
    const parsed = apiKeyNameSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.errors?.[0]?.message ?? 'Name is required');
    }
    const data = await meService.createApiKey(req.user.id, parsed.data.name);
    res.status(201).json(data);
  } catch (err) {
    console.error('[me] POST /api-keys', err);
    sendError(res, 500, err.message || 'Failed to create API key');
  }
});

/** DELETE /v1/me/api-keys/:id */
meRouter.delete('/api-keys/:id', async (req, res) => {
  try {
    const ok = await meService.revokeApiKey(req.user.id, req.params.id);
    if (!ok) return sendError(res, 404, 'API key not found');
    res.status(204).send();
  } catch (err) {
    console.error('[me] DELETE /api-keys/:id', err);
    sendError(res, 500, 'Failed to revoke key');
  }
});

/** GET /v1/me/export */
meRouter.get('/export', async (req, res) => {
  try {
    const data = await meService.exportMe(req.user.id, req.user.email);
    if (!data) return sendError(res, 404, 'User not found');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="claidex-export.json"');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[me] GET /export', err);
    sendError(res, 500, 'Failed to export data');
  }
});
