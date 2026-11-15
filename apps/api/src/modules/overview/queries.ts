import type { EntityManager } from '@mikro-orm/postgresql';

// Independent aggregates prevent bookings × blocks from inflating sales or capacity.
export async function overview(em: EntityManager, from: string, to: string) {
  const result = await em.execute(
    `
    WITH capacities AS (
      SELECT v.id, v.name, v.kind, count(r.id)::int AS capacity
      FROM venues v LEFT JOIN resources r ON r.venue_id=v.id GROUP BY v.id
    ), selected_bookings AS (
      SELECT * FROM bookings WHERE status='confirmed' AND starts_at<:to AND ends_at>:from
    ), event_totals AS (
      SELECT s.*, c.name AS venue_name,
        (SELECT count(*)::int FROM bookings b WHERE b.show_id=s.id AND b.status='confirmed') AS sold,
        (SELECT count(*)::int FROM event_seat_blocks b WHERE b.show_id=s.id) AS blocked,
        c.capacity
      FROM shows s JOIN capacities c ON c.id=s.venue_id WHERE c.kind IN ('cinema','stadium')
    ), events AS (
      SELECT *, jsonb_build_object('id',id,'venueId',venue_id,'venueName',venue_name,'title',title,
        'start',starts_at,'sold',sold,'blocked',blocked,'capacity',greatest(0,capacity-blocked)) AS data
      FROM event_totals
    ), selected_events AS (
      SELECT * FROM events WHERE starts_at<:to AND ends_at>:from
    ), days AS (
      SELECT d, least(d+interval '24 hours',:to::timestamptz) AS until
      FROM generate_series(:from::timestamptz,:to::timestamptz,interval '24 hours') d WHERE d<:to
    ), resource_days AS (
      SELECT c.id, c.capacity,
        (SELECT count(DISTINCT b.resource_id) FROM selected_bookings b
         WHERE b.venue_id=c.id AND b.starts_at<days.until AND b.ends_at>days.d) AS booked
      FROM capacities c CROSS JOIN days WHERE c.kind NOT IN ('cinema','stadium')
    ), recent AS (
      SELECT b.id,b.guest_name AS "guestName",c.name AS "venueName",r.label AS "resourceLabel",b.starts_at AS start
      FROM selected_bookings b JOIN capacities c ON c.id=b.venue_id JOIN resources r ON r.id=b.resource_id
      ORDER BY b.created_at DESC,b.id LIMIT 10
    ), revenue AS (
      SELECT currency,sum(price) AS amount FROM selected_bookings GROUP BY currency ORDER BY currency
    ), venue_cards AS (
      SELECT c.id,c.name,c.kind,
        CASE WHEN c.kind IN ('cinema','stadium') THEN coalesce(e.sold,0)
        ELSE (SELECT count(DISTINCT b.resource_id) FROM bookings b WHERE b.venue_id=c.id AND b.status='confirmed'
          AND b.starts_at<date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'+interval '24 hours'
          AND b.ends_at>date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') END AS booked,
        CASE WHEN c.kind IN ('cinema','stadium') THEN coalesce(greatest(0,e.capacity-e.blocked),0) ELSE c.capacity END AS capacity,
        e.data AS event
      FROM capacities c LEFT JOIN LATERAL (
        SELECT * FROM events e WHERE e.venue_id=c.id AND e.ends_at>now() ORDER BY e.starts_at,e.id LIMIT 1
      ) e ON true ORDER BY c.name,c.id
    )
    SELECT jsonb_build_object(
      'reservations',(SELECT count(*) FROM selected_bookings),
      'placesBooked',(SELECT coalesce(sum(party_size),0) FROM selected_bookings),
      'revenue',coalesce((SELECT jsonb_agg(revenue) FROM revenue),'[]'::jsonb),
      'seats',jsonb_build_object('booked',(SELECT coalesce(sum(sold),0) FROM selected_events),
        'capacity',(SELECT coalesce(sum(greatest(0,capacity-blocked)),0) FROM selected_events)),
      'resources',jsonb_build_object('booked',(SELECT coalesce(sum(booked),0) FROM resource_days),
        'capacity',(SELECT coalesce(sum(capacity),0) FROM resource_days)),
      'events',coalesce((SELECT jsonb_agg(data ORDER BY starts_at,id) FROM selected_events WHERE ends_at>now()),'[]'::jsonb),
      'recent',coalesce((SELECT jsonb_agg(recent) FROM recent),'[]'::jsonb),
      'venues',coalesce((SELECT jsonb_agg(venue_cards) FROM venue_cards),'[]'::jsonb)
    ) AS overview`,
    { from, to },
  );
  return result[0].overview;
}
