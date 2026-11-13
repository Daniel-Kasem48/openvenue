ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_kind_check;
ALTER TABLE venues ADD CONSTRAINT venues_kind_check CHECK (kind IN ('restaurant','parking','cinema','stadium'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price integer NOT NULL DEFAULT 0 CHECK (price BETWEEN 0 AND 100000000);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','EUR','GBP','AED','SAR','SYP'));
