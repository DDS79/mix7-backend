CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_payment', 'paid', 'failed')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  intent_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

