import crypto from 'crypto';
import { queryPg } from '../db/postgres';

const KEY_PREFIX_LEN = 8;
const KEY_BYTES = 32;

function hashKey(secret: string): string {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function toIso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  position: string | null;
  organization_id: string | null;
  timezone: string | null;
  locale: string | null;
  preferences: unknown;
  created_at: Date;
  updated_at: Date;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  logo_url: string | null;
  billing_email: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MeProfile {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  position: string | null;
  organization_id: string | null;
  timezone: string | null;
  locale: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  organization: {
    id: string;
    name: string;
    slug: string | null;
    industry: string | null;
    logo_url: string | null;
    billing_email: string | null;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  organization_role: string | null;
  notifications: {
    email_alerts: boolean;
    email_digest_frequency: string;
    event_severity_min: string;
    program_filter: string[];
    watchlist_only: boolean;
    updated_at: string | null;
  } | null;
}

export async function getMe(userId: string): Promise<MeProfile | null> {
  const userRows = await queryPg<UserRow>(
    `SELECT id, email, name, role, position, organization_id, timezone, locale, preferences, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = userRows[0];
  if (!user) return null;

  let organization: MeProfile['organization'] = null;
  let memberRole: string | null = null;
  let notificationPrefs: MeProfile['notifications'] = null;

  if (user.organization_id) {
    const orgRows = await queryPg<OrgRow>(
      'SELECT id, name, slug, industry, logo_url, billing_email, address_line1, city, state, country, created_at, updated_at FROM organizations WHERE id = $1',
      [user.organization_id]
    );
    const org = orgRows[0];
    if (org) {
      organization = {
        id: org.id,
        name: org.name,
        slug: org.slug,
        industry: org.industry,
        logo_url: org.logo_url,
        billing_email: org.billing_email,
        address_line1: org.address_line1,
        city: org.city,
        state: org.state,
        country: org.country,
        created_at: toIso(org.created_at) ?? '',
        updated_at: toIso(org.updated_at) ?? '',
      };
    }
    const memRows = await queryPg<{ role: string | null }>(
      'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [user.organization_id, userId]
    );
    memberRole = memRows[0]?.role ?? user.role;
  }

  const prefsRows = await queryPg<{
    email_alerts: boolean;
    email_digest_frequency: string;
    event_severity_min: string;
    program_filter: string[] | null;
    watchlist_only: boolean;
    updated_at: Date;
  }>(
    'SELECT email_alerts, email_digest_frequency, event_severity_min, program_filter, watchlist_only, updated_at FROM user_notification_preferences WHERE user_id = $1',
    [userId]
  );
  const prefs = prefsRows[0];
  if (prefs) {
    notificationPrefs = {
      email_alerts: prefs.email_alerts,
      email_digest_frequency: prefs.email_digest_frequency,
      event_severity_min: prefs.event_severity_min,
      program_filter: prefs.program_filter ?? [],
      watchlist_only: prefs.watchlist_only,
      updated_at: toIso(prefs.updated_at),
    };
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    position: user.position,
    organization_id: user.organization_id,
    timezone: user.timezone,
    locale: user.locale,
    preferences: (user.preferences as Record<string, unknown>) ?? {},
    created_at: toIso(user.created_at) ?? '',
    updated_at: toIso(user.updated_at) ?? '',
    organization,
    organization_role: memberRole,
    notifications: notificationPrefs,
  };
}

export async function updateProfile(
  userId: string,
  body: { name?: string; position?: string; timezone?: string; locale?: string; preferences?: Record<string, unknown> }
): Promise<MeProfile> {
  const { name, position, timezone, locale, preferences } = body;
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (name !== undefined) {
    updates.push(`name = $${i++}`);
    values.push(name);
  }
  if (position !== undefined) {
    updates.push(`position = $${i++}`);
    values.push(position);
  }
  if (timezone !== undefined) {
    updates.push(`timezone = $${i++}`);
    values.push(timezone);
  }
  if (locale !== undefined) {
    updates.push(`locale = $${i++}`);
    values.push(locale);
  }
  if (preferences !== undefined) {
    updates.push(`preferences = $${i++}`);
    values.push(JSON.stringify(preferences));
  }
  if (updates.length === 0) {
    const me = await getMe(userId);
    if (!me) throw new Error('User not found');
    return me;
  }
  updates.push('updated_at = NOW()');
  values.push(userId);
  await queryPg(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`,
    values
  );
  const me = await getMe(userId);
  if (!me) throw new Error('User not found');
  return me;
}

export async function getSecurityLog(userId: string): Promise<{ id: string; action: string; ip_address: string | null; user_agent: string | null; created_at: string }[]> {
  const rows = await queryPg<{ id: string; action: string; ip_address: string | null; user_agent: string | null; created_at: Date }>(
    `SELECT id, action, ip_address, user_agent, created_at
     FROM user_security_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    created_at: toIso(row.created_at) ?? '',
  }));
}

export async function revokeSessions(userId: string, ipAddress: string | null, userAgent: string | null): Promise<void> {
  await queryPg(
    `INSERT INTO user_security_log (user_id, action, ip_address, user_agent) VALUES ($1, 'sessions_revoked', $2, $3)`,
    [userId, ipAddress, userAgent]
  );
}

interface NotificationsRow {
  email_alerts: boolean;
  email_digest_frequency: string;
  event_severity_min: string;
  program_filter: string[] | null;
  watchlist_only: boolean;
  updated_at: Date;
}

export async function getNotifications(userId: string): Promise<{
  email_alerts: boolean;
  email_digest_frequency: string;
  event_severity_min: string;
  program_filter: string[];
  watchlist_only: boolean;
  updated_at: string | null;
} | null> {
  const rows = await queryPg<NotificationsRow>(
    `SELECT email_alerts, email_digest_frequency, event_severity_min, program_filter, watchlist_only, updated_at
     FROM user_notification_preferences WHERE user_id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    email_alerts: row.email_alerts,
    email_digest_frequency: row.email_digest_frequency,
    event_severity_min: row.event_severity_min,
    program_filter: row.program_filter ?? [],
    watchlist_only: row.watchlist_only,
    updated_at: toIso(row.updated_at),
  };
}

export async function updateNotifications(
  userId: string,
  body: Partial<{
    email_alerts: boolean;
    email_digest_frequency: string;
    event_severity_min: string;
    program_filter: string[];
    watchlist_only: boolean;
  }>
): Promise<NonNullable<Awaited<ReturnType<typeof getNotifications>>>> {
  const { email_alerts, email_digest_frequency, event_severity_min, program_filter, watchlist_only } = body;
  await queryPg(
    `INSERT INTO user_notification_preferences (user_id, email_alerts, email_digest_frequency, event_severity_min, program_filter, watchlist_only, updated_at)
     VALUES ($1, COALESCE($2, true), COALESCE($3, 'weekly'), COALESCE($4, 'high'), COALESCE($5, ARRAY[]::text[]), COALESCE($6, false), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       email_alerts = COALESCE(EXCLUDED.email_alerts, user_notification_preferences.email_alerts),
       email_digest_frequency = COALESCE(EXCLUDED.email_digest_frequency, user_notification_preferences.email_digest_frequency),
       event_severity_min = COALESCE(EXCLUDED.event_severity_min, user_notification_preferences.event_severity_min),
       program_filter = COALESCE(EXCLUDED.program_filter, user_notification_preferences.program_filter),
       watchlist_only = COALESCE(EXCLUDED.watchlist_only, user_notification_preferences.watchlist_only),
       updated_at = NOW()`,
    [userId, email_alerts, email_digest_frequency, event_severity_min, program_filter ?? [], watchlist_only]
  );
  const next = await getNotifications(userId);
  return next ?? {
    email_alerts: true,
    email_digest_frequency: 'weekly',
    event_severity_min: 'high',
    program_filter: [],
    watchlist_only: false,
    updated_at: null,
  };
}

export async function getOrganization(userId: string): Promise<{
  organization: MeProfile['organization'];
  role: string | null;
}> {
  const uRows = await queryPg<{ organization_id: string | null }>('SELECT organization_id FROM users WHERE id = $1', [userId]);
  const orgId = uRows[0]?.organization_id;
  if (!orgId) return { organization: null, role: null };

  const orgRows = await queryPg<OrgRow>(
    'SELECT id, name, slug, industry, logo_url, billing_email, address_line1, city, state, country, created_at, updated_at FROM organizations WHERE id = $1',
    [orgId]
  );
  const memRows = await queryPg<{ role: string | null }>(
    'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  const org = orgRows[0];
  const role = memRows[0]?.role ?? null;
  return {
    organization: org
      ? {
          id: org.id,
          name: org.name,
          slug: org.slug,
          industry: org.industry,
          logo_url: org.logo_url,
          billing_email: org.billing_email,
          address_line1: org.address_line1,
          city: org.city,
          state: org.state,
          country: org.country,
          created_at: toIso(org.created_at) ?? '',
          updated_at: toIso(org.updated_at) ?? '',
        }
      : null,
    role,
  };
}

export async function isOrgAdmin(userId: string): Promise<boolean> {
  const rows = await queryPg<{ n: number }>(
    `SELECT 1 AS n FROM organization_members om
     JOIN users u ON u.organization_id = om.organization_id AND u.id = om.user_id
     WHERE om.user_id = $1 AND om.role = 'admin' LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

export async function updateOrganization(
  userId: string,
  body: Partial<{
    name: string;
    slug: string;
    industry: string;
    billing_email: string;
    address_line1: string;
    city: string;
    state: string;
    country: string;
  }>
): Promise<Awaited<ReturnType<typeof getOrganization>>> {
  const uRows = await queryPg<{ organization_id: string | null }>('SELECT organization_id FROM users WHERE id = $1', [userId]);
  const orgId = uRows[0]?.organization_id;
  if (!orgId) throw new Error('No organization');

  const { name, slug, industry, billing_email, address_line1, city, state, country } = body;
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (name !== undefined) {
    updates.push(`name = $${i++}`);
    values.push(name);
  }
  if (slug !== undefined) {
    updates.push(`slug = $${i++}`);
    values.push(slug);
  }
  if (industry !== undefined) {
    updates.push(`industry = $${i++}`);
    values.push(industry);
  }
  if (billing_email !== undefined) {
    updates.push(`billing_email = $${i++}`);
    values.push(billing_email);
  }
  if (address_line1 !== undefined) {
    updates.push(`address_line1 = $${i++}`);
    values.push(address_line1);
  }
  if (city !== undefined) {
    updates.push(`city = $${i++}`);
    values.push(city);
  }
  if (state !== undefined) {
    updates.push(`state = $${i++}`);
    values.push(state);
  }
  if (country !== undefined) {
    updates.push(`country = $${i++}`);
    values.push(country);
  }
  if (updates.length === 0) return getOrganization(userId);
  updates.push('updated_at = NOW()');
  values.push(orgId);
  await queryPg(`UPDATE organizations SET ${updates.join(', ')} WHERE id = $${i}`, values);
  return getOrganization(userId);
}

export async function getOrganizationMembers(userId: string): Promise<{ id: string; name: string | null; email: string; role: string | null; joined_at: string }[]> {
  const uRows = await queryPg<{ organization_id: string | null }>('SELECT organization_id FROM users WHERE id = $1', [userId]);
  const orgId = uRows[0]?.organization_id;
  if (!orgId) return [];

  const rows = await queryPg<{ id: string; name: string | null; email: string; role: string | null; created_at: Date }>(
    `SELECT om.id, u.name, u.email, om.role, om.created_at
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1 ORDER BY om.created_at ASC`,
    [orgId]
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    joined_at: toIso(row.created_at) ?? '',
  }));
}

export async function updateMemberRole(
  userId: string,
  memberId: string,
  role: 'viewer' | 'analyst' | 'admin'
): Promise<Awaited<ReturnType<typeof getOrganizationMembers>> | null> {
  const uRows = await queryPg<{ organization_id: string | null }>('SELECT organization_id FROM users WHERE id = $1', [userId]);
  const orgId = uRows[0]?.organization_id;
  if (!orgId) return null;

  const r = await queryPg(
    'UPDATE organization_members SET role = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3 RETURNING id',
    [role, memberId, orgId]
  );
  return r.length > 0 ? getOrganizationMembers(userId) : null;
}

export async function removeMember(userId: string, memberId: string): Promise<boolean> {
  const uRows = await queryPg<{ organization_id: string | null }>('SELECT organization_id FROM users WHERE id = $1', [userId]);
  const orgId = uRows[0]?.organization_id;
  if (!orgId) return false;

  const r = await queryPg(
    'DELETE FROM organization_members WHERE id = $1 AND organization_id = $2 RETURNING id',
    [memberId, orgId]
  );
  return r.length > 0;
}

export async function getApiKeys(userId: string): Promise<{ id: string; name: string; key_prefix: string; last_used_at: string | null; created_at: string }[]> {
  try {
    const rows = await queryPg<{ id: string; name: string; key_prefix: string; last_used_at: Date | null; created_at: Date }>(
      'SELECT id, name, key_prefix, last_used_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      key_prefix: row.key_prefix,
      last_used_at: toIso(row.last_used_at),
      created_at: toIso(row.created_at) ?? '',
    }));
  } catch {
    return [];
  }
}

export async function createApiKey(
  userId: string,
  name: string
): Promise<{ id: string; name: string; key_prefix: string; created_at: string; key: string }> {
  const secret = crypto.randomBytes(KEY_BYTES).toString('hex');
  const keyPrefix = secret.slice(0, KEY_PREFIX_LEN);
  const keyHash = hashKey(secret);

  try {
    const rows = await queryPg<{ id: string; name: string; key_prefix: string; created_at: Date }>(
      `INSERT INTO api_keys (user_id, name, key_prefix, key_hash) VALUES ($1, $2, $3, $4)
       RETURNING id, name, key_prefix, created_at`,
      [userId, name, keyPrefix, keyHash]
    );
    const row = rows[0];
    if (!row) throw new Error('Insert failed');
    return {
      id: row.id,
      name: row.name,
      key_prefix: row.key_prefix,
      created_at: toIso(row.created_at) ?? '',
      key: secret,
    };
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') throw new Error('api_keys table not found. Run etl/schemas/api_keys.sql');
    throw err;
  }
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const r = await queryPg(
    'DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id',
    [keyId, userId]
  );
  return r.length > 0;
}

export async function exportMe(userId: string, email: string): Promise<{
  exported_at: string;
  profile: Record<string, unknown>;
  organization: MeProfile['organization'];
  notifications: MeProfile['notifications'];
  watchlist_summary: { id: string; type: string; entity_id: string; created_at: string }[];
} | null> {
  const me = await getMe(userId);
  if (!me) return null;

  let watchlist_summary: { id: string; type: string; entity_id: string; created_at: string }[] = [];
  try {
    const w = await queryPg<{ id: string; type: string; entity_id: string; created_at: Date }>(
      'SELECT id, type, entity_id, created_at FROM watchlist WHERE email = $1 ORDER BY created_at DESC',
      [email]
    );
    watchlist_summary = w.map((row) => ({
      id: row.id,
      type: row.type,
      entity_id: row.entity_id,
      created_at: toIso(row.created_at) ?? '',
    }));
  } catch {
    // watchlist table may not exist
  }

  return {
    exported_at: new Date().toISOString(),
    profile: {
      id: me.id,
      email: me.email,
      name: me.name,
      role: me.role,
      position: me.position,
      timezone: me.timezone,
      locale: me.locale,
      preferences: me.preferences,
    },
    organization: me.organization,
    notifications: me.notifications,
    watchlist_summary,
  };
}
