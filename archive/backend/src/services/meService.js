import crypto from 'crypto';
import { postgresPool } from '../db/postgres.js';

const KEY_PREFIX_LEN = 8;
const KEY_BYTES = 32;

function hashKey(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function toIso(d) {
  return d ? new Date(d).toISOString() : null;
}

/** Current user's full profile + org + notification preferences */
export async function getMe(userId) {
  const client = await postgresPool.connect();
  try {
    const userRes = await client.query(
      `SELECT id, email, name, role, position, organization_id, timezone, locale, preferences, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) return null;

    let organization = null;
    let memberRole = null;
    let notificationPrefs = null;

    if (user.organization_id) {
      const orgRes = await client.query(
        'SELECT id, name, slug, industry, logo_url, billing_email, address_line1, city, state, country, created_at, updated_at FROM organizations WHERE id = $1',
        [user.organization_id]
      );
      organization = orgRes.rows[0] ?? null;

      const memRes = await client.query(
        'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
        [user.organization_id, userId]
      );
      memberRole = memRes.rows[0]?.role ?? user.role;
    }

    const prefsRes = await client.query(
      'SELECT email_alerts, email_digest_frequency, event_severity_min, program_filter, watchlist_only, updated_at FROM user_notification_preferences WHERE user_id = $1',
      [userId]
    );
    notificationPrefs = prefsRes.rows[0] ?? null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      position: user.position,
      organization_id: user.organization_id,
      timezone: user.timezone,
      locale: user.locale,
      preferences: user.preferences ?? {},
      created_at: toIso(user.created_at),
      updated_at: toIso(user.updated_at),
      organization: organization ? {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        industry: organization.industry,
        logo_url: organization.logo_url,
        billing_email: organization.billing_email,
        address_line1: organization.address_line1,
        city: organization.city,
        state: organization.state,
        country: organization.country,
        created_at: toIso(organization.created_at),
        updated_at: toIso(organization.updated_at),
      } : null,
      organization_role: memberRole,
      notifications: notificationPrefs ? {
        email_alerts: notificationPrefs.email_alerts,
        email_digest_frequency: notificationPrefs.email_digest_frequency,
        event_severity_min: notificationPrefs.event_severity_min,
        program_filter: notificationPrefs.program_filter ?? [],
        watchlist_only: notificationPrefs.watchlist_only,
        updated_at: toIso(notificationPrefs.updated_at),
      } : null,
    };
  } finally {
    client.release();
  }
}

/** Update profile and optionally preferences */
export async function updateProfile(userId, body) {
  const { name, position, timezone, locale, preferences } = body;
  const client = await postgresPool.connect();
  try {
    const updates = [];
    const values = [];
    let i = 1;
    if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name); }
    if (position !== undefined) { updates.push(`position = $${i++}`); values.push(position); }
    if (timezone !== undefined) { updates.push(`timezone = $${i++}`); values.push(timezone); }
    if (locale !== undefined) { updates.push(`locale = $${i++}`); values.push(locale); }
    if (preferences !== undefined) { updates.push(`preferences = $${i++}`); values.push(JSON.stringify(preferences)); }
    if (updates.length === 0) return getMe(userId);
    updates.push(`updated_at = NOW()`);
    values.push(userId);
    await client.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`,
      values
    );
    return getMe(userId);
  } finally {
    client.release();
  }
}

/** Last 20 security log entries */
export async function getSecurityLog(userId) {
  const r = await postgresPool.query(
    `SELECT id, action, ip_address, user_agent, created_at
     FROM user_security_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );
  return r.rows.map(row => ({
    id: row.id,
    action: row.action,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    created_at: toIso(row.created_at),
  }));
}

/** Log session revoke and return */
export async function revokeSessions(userId, ipAddress, userAgent) {
  await postgresPool.query(
    `INSERT INTO user_security_log (user_id, action, ip_address, user_agent) VALUES ($1, 'sessions_revoked', $2, $3)`,
    [userId, ipAddress || null, userAgent || null]
  );
  return { revoked: true };
}

/** Get notification preferences (also on getMe) */
export async function getNotifications(userId) {
  const r = await postgresPool.query(
    `SELECT email_alerts, email_digest_frequency, event_severity_min, program_filter, watchlist_only, updated_at
     FROM user_notification_preferences WHERE user_id = $1`,
    [userId]
  );
  const row = r.rows[0];
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

/** Upsert notification preferences */
export async function updateNotifications(userId, body) {
  const { email_alerts, email_digest_frequency, event_severity_min, program_filter, watchlist_only } = body;
  await postgresPool.query(
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
  return getNotifications(userId);
}

/** Organization details + current user's role */
export async function getOrganization(userId) {
  const u = await postgresPool.query('SELECT organization_id FROM users WHERE id = $1', [userId]);
  const orgId = u.rows[0]?.organization_id;
  if (!orgId) return { organization: null, role: null };

  const orgRes = await postgresPool.query(
    'SELECT id, name, slug, industry, logo_url, billing_email, address_line1, city, state, country, created_at, updated_at FROM organizations WHERE id = $1',
    [orgId]
  );
  const memRes = await postgresPool.query(
    'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  const org = orgRes.rows[0];
  const role = memRes.rows[0]?.role ?? null;
  return {
    organization: org ? {
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
      created_at: toIso(org.created_at),
      updated_at: toIso(org.updated_at),
    } : null,
    role,
  };
}

/** Whether user is org admin (for this org) */
export async function isOrgAdmin(userId) {
  const r = await postgresPool.query(
    `SELECT 1 FROM organization_members om
     JOIN users u ON u.organization_id = om.organization_id AND u.id = om.user_id
     WHERE om.user_id = $1 AND om.role = 'admin' LIMIT 1`,
    [userId]
  );
  return r.rows.length > 0;
}

/** Update organization (admin only); caller must check isOrgAdmin */
export async function updateOrganization(userId, body) {
  const u = await postgresPool.query('SELECT organization_id FROM users WHERE id = $1', [userId]);
  const orgId = u.rows[0]?.organization_id;
  if (!orgId) return null;

  const { name, slug, industry, billing_email, address_line1, city, state, country } = body;
  const updates = [];
  const values = [];
  let i = 1;
  if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name); }
  if (slug !== undefined) { updates.push(`slug = $${i++}`); values.push(slug); }
  if (industry !== undefined) { updates.push(`industry = $${i++}`); values.push(industry); }
  if (billing_email !== undefined) { updates.push(`billing_email = $${i++}`); values.push(billing_email); }
  if (address_line1 !== undefined) { updates.push(`address_line1 = $${i++}`); values.push(address_line1); }
  if (city !== undefined) { updates.push(`city = $${i++}`); values.push(city); }
  if (state !== undefined) { updates.push(`state = $${i++}`); values.push(state); }
  if (country !== undefined) { updates.push(`country = $${i++}`); values.push(country); }
  if (updates.length === 0) return getOrganization(userId);
  updates.push('updated_at = NOW()');
  values.push(orgId);
  await postgresPool.query(
    `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${i}`,
    values
  );
  return getOrganization(userId);
}

/** List org members (name, email, role, joined) */
export async function getOrganizationMembers(userId) {
  const u = await postgresPool.query('SELECT organization_id FROM users WHERE id = $1', [userId]);
  const orgId = u.rows[0]?.organization_id;
  if (!orgId) return [];

  const r = await postgresPool.query(
    `SELECT om.id, u.name, u.email, om.role, om.created_at
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1 ORDER BY om.created_at ASC`,
    [orgId]
  );
  return r.rows.map(row => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    joined_at: toIso(row.created_at),
  }));
}

/** Update member role (admin only); memberId = organization_members.id */
export async function updateMemberRole(userId, memberId, role) {
  const u = await postgresPool.query('SELECT organization_id FROM users WHERE id = $1', [userId]);
  const orgId = u.rows[0]?.organization_id;
  if (!orgId) return null;

  const r = await postgresPool.query(
    'UPDATE organization_members SET role = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3 RETURNING id',
    [role, memberId, orgId]
  );
  return r.rows[0] ? getOrganizationMembers(userId) : null;
}

/** Remove member (admin only) */
export async function removeMember(userId, memberId) {
  const u = await postgresPool.query('SELECT organization_id FROM users WHERE id = $1', [userId]);
  const orgId = u.rows[0]?.organization_id;
  if (!orgId) return false;

  const r = await postgresPool.query(
    'DELETE FROM organization_members WHERE id = $1 AND organization_id = $2 RETURNING id',
    [memberId, orgId]
  );
  return r.rowCount > 0;
}

/** List API keys for user */
export async function getApiKeys(userId) {
  const r = await postgresPool.query(
    'SELECT id, name, key_prefix, last_used_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  ).catch(() => ({ rows: [] }));
  return r.rows.map(row => ({
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    last_used_at: toIso(row.last_used_at),
    created_at: toIso(row.created_at),
  }));
}

/** Create API key; returns full key once (client must store); store hash */
export async function createApiKey(userId, name) {
  const secret = crypto.randomBytes(KEY_BYTES).toString('hex');
  const keyPrefix = secret.slice(0, KEY_PREFIX_LEN);
  const keyHash = hashKey(secret);

  const r = await postgresPool.query(
    `INSERT INTO api_keys (user_id, name, key_prefix, key_hash) VALUES ($1, $2, $3, $4)
     RETURNING id, name, key_prefix, created_at`,
    [userId, name, keyPrefix, keyHash]
  ).catch((err) => {
    if (err.code === '42P01') throw new Error('api_keys table not found. Run etl/schemas/api_keys.sql');
    throw err;
  });
  const row = r.rows[0];
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    created_at: toIso(row.created_at),
    key: secret,
  };
}

/** Revoke API key */
export async function revokeApiKey(userId, keyId) {
  const r = await postgresPool.query(
    'DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id',
    [keyId, userId]
  );
  return r.rowCount > 0;
}

/** Export user data (profile, preferences, watchlist summary) */
export async function exportMe(userId, email) {
  const me = await getMe(userId);
  if (!me) return null;

  let watchlist_summary = [];
  try {
    const w = await postgresPool.query(
      'SELECT id, type, entity_id, created_at FROM watchlist WHERE email = $1 ORDER BY created_at DESC',
      [email]
    );
    watchlist_summary = w.rows.map(row => ({
      id: row.id,
      type: row.type,
      entity_id: row.entity_id,
      created_at: toIso(row.created_at),
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
