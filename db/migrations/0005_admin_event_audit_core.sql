CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  venue_id TEXT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  category_ref TEXT NULL,
  characteristic_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'members_only', 'invite_only')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  sales_open BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_slug ON events (slug);
CREATE INDEX IF NOT EXISTS idx_events_public_listing ON events (archived_at, status, starts_at);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN (
      'EVENT_CREATED',
      'EVENT_UPDATED',
      'EVENT_SALES_OPENED',
      'EVENT_SALES_CLOSED',
      'EVENT_ARCHIVED'
    )
  ),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json JSONB NULL,
  after_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity_created_at
  ON admin_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON admin_audit_log (created_at DESC);

INSERT INTO events (
  id,
  slug,
  venue_id,
  title,
  summary,
  description,
  status,
  starts_at,
  ends_at,
  category_ref,
  characteristic_refs,
  visibility,
  metadata,
  price_minor,
  currency,
  sales_open,
  archived_at,
  created_at,
  updated_at
)
VALUES
  (
    'evt_7f1ed0d65b3d7b6b18dc1001',
    'open-studio-day',
    'ven_mix7_main',
    'Open Studio Day',
    'Free daytime access to the space for community visitors.',
    'An open daytime format with community access, public program context, and immediate ticket issuance.',
    'published',
    '2026-04-20T10:00:00.000Z',
    '2026-04-20T16:00:00.000Z',
    'ecat_workshop',
    '["echar_daytime","echar_members_friendly"]'::jsonb,
    'public',
    '{}'::jsonb,
    0,
    'RUB',
    TRUE,
    NULL,
    '2026-04-01T00:00:00.000Z',
    '2026-04-01T00:00:00.000Z'
  ),
  (
    'evt_1f660cdf31de258568b11002',
    'night-listening-session',
    'ven_mix7_main',
    'Night Listening Session',
    'Paid evening event with explicit checkout handoff.',
    'A paid evening program that requires registration first and checkout as the commercial branch.',
    'published',
    '2026-04-25T20:00:00.000Z',
    '2026-04-25T23:30:00.000Z',
    'ecat_music',
    '["echar_evening"]'::jsonb,
    'public',
    '{}'::jsonb,
    2500,
    'RUB',
    TRUE,
    NULL,
    '2026-04-01T00:00:00.000Z',
    '2026-04-01T00:00:00.000Z'
  )
ON CONFLICT (slug) DO NOTHING;
