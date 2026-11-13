CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS venues (
 id uuid PRIMARY KEY, name text NOT NULL, kind text NOT NULL CHECK (kind IN ('restaurant','parking','cinema')),
 layout jsonb NOT NULL, revision integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS resources (
 id uuid PRIMARY KEY, venue_id uuid NOT NULL REFERENCES venues(id), label text NOT NULL
);
CREATE TABLE IF NOT EXISTS shows (
 id uuid PRIMARY KEY, venue_id uuid NOT NULL REFERENCES venues(id), title text NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK (ends_at > starts_at)
);
CREATE TABLE IF NOT EXISTS bookings (
 id uuid PRIMARY KEY, venue_id uuid NOT NULL REFERENCES venues(id), resource_id uuid NOT NULL REFERENCES resources(id),
 guest_name text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
 show_id uuid REFERENCES shows(id), status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status='confirmed')
);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS bookings_venue ON bookings(venue_id);
CREATE INDEX IF NOT EXISTS resources_venue ON resources(venue_id);
