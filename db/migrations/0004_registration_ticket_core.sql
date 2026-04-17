CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ NULL,
  checkout_order_id TEXT UNIQUE NULL REFERENCES orders(id) ON DELETE SET NULL,
  ticket_id TEXT UNIQUE NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  order_id TEXT NULL REFERENCES orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  access_class TEXT NOT NULL,
  valid_from TIMESTAMPTZ NULL,
  valid_to TIMESTAMPTZ NULL,
  access_code TEXT NOT NULL,
  barcode_ref TEXT NULL,
  qr_payload TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL
);
