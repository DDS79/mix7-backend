ALTER TABLE events
  ADD COLUMN IF NOT EXISTS capacity INTEGER NULL CHECK (capacity IS NULL OR capacity >= 0);

CREATE INDEX IF NOT EXISTS idx_events_capacity ON events (capacity);
