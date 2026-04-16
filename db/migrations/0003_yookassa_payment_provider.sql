ALTER TABLE payments
ADD COLUMN IF NOT EXISTS confirmation_url TEXT;
