CREATE TABLE IF NOT EXISTS actors (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('customer', 'operator', 'guard')),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'blocked')),
  buyer_ref TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_actors_buyer_ref ON actors (buyer_ref);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('anonymous', 'phone', 'email', 'external_provider')),
  status TEXT NOT NULL CHECK (status IN ('provisional', 'active', 'blocked')),
  login_ref TEXT NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (actor_id, auth_type, login_ref)
);

CREATE INDEX IF NOT EXISTS idx_auth_accounts_lookup
  ON auth_accounts (actor_id, auth_type, login_ref);

CREATE INDEX IF NOT EXISTS idx_auth_accounts_login_ref
  ON auth_accounts (auth_type, login_ref);

CREATE TABLE IF NOT EXISTS actor_profiles (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL UNIQUE REFERENCES actors(id) ON DELETE CASCADE,
  display_name TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

