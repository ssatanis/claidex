CREATE TABLE IF NOT EXISTS user_notification_preferences (
    user_id UUID PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_alerts BOOLEAN DEFAULT true,
    email_digest_frequency TEXT DEFAULT 'weekly', -- none, daily, weekly
    event_severity_min TEXT DEFAULT 'high', -- low, medium, high, critical
    program_filter TEXT[],
    watchlist_only BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
