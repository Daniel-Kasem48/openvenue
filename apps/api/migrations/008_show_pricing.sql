ALTER TABLE shows ADD COLUMN IF NOT EXISTS price_multiplier numeric(4,2) NOT NULL DEFAULT 1 CHECK (price_multiplier >= 0 AND price_multiplier <= 99.99);
CREATE TABLE IF NOT EXISTS show_prices (
  show_id uuid NOT NULL REFERENCES shows(id),
  tier_id text NOT NULL,
  amount integer NOT NULL CHECK (amount BETWEEN 0 AND 100000000),
  PRIMARY KEY (show_id, tier_id)
);
