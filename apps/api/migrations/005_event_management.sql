ALTER TABLE bookings ADD COLUMN IF NOT EXISTS event_title text;
UPDATE bookings b SET event_title=s.title FROM shows s WHERE b.show_id=s.id AND b.event_title IS NULL;
