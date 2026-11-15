ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_email text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_phone text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('confirmed','cancelled','no_show'));
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_checkin_status;
ALTER TABLE bookings ADD CONSTRAINT bookings_checkin_status CHECK (checked_in_at IS NULL OR status='confirmed');
CREATE INDEX IF NOT EXISTS bookings_start_id ON bookings(starts_at,id);
