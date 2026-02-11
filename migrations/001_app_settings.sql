-- Add app_settings table for Workday sync schedule (and future key-value settings).
-- Safe to run on existing DBs: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
