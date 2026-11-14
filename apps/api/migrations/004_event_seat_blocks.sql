CREATE TABLE IF NOT EXISTS event_seat_blocks (
 show_id uuid NOT NULL REFERENCES shows(id),
 resource_id uuid NOT NULL REFERENCES resources(id),
 reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 240),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(show_id,resource_id)
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seat_location text;
