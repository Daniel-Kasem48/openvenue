import { useEffect, useState } from 'react';
import type { ManagedEvent } from '@openvenue/contracts';
import { api } from './api';

export function Events({
  venueId,
  stadium,
  revision,
  onAdd,
  onEdit,
  onManage,
  onRemove,
}: {
  venueId: string;
  stadium: boolean;
  revision: number;
  onAdd: () => void;
  onEdit: (event: ManagedEvent) => void;
  onManage: (event: ManagedEvent) => void;
  onRemove: (event: ManagedEvent, cancel: boolean) => void;
}) {
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<ManagedEvent[]>(`/venues/${venueId}/events`, { signal: controller.signal })
      .then(setEvents)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [venueId, revision, refresh]);
  const remove = (event: ManagedEvent, cancel: boolean) => {
    const message = cancel
      ? `Cancel “${event.title}”? ${event.sold} confirmed reservations will be cancelled and the event removed. Reservation history will be kept.`
      : `Delete “${event.title}”? ${event.sold} confirmed reservations affected. Blocks will be removed; reservation history will be kept.`;
    if (confirm(message)) onRemove(event, cancel);
  };
  return (
    <div className="space-y-4 p-6 max-sm:p-4" role="tabpanel" aria-label="Events">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3>Events</h3>
          <p className="muted">Upcoming and past events · Available capacity excludes blocks</p>
        </div>
        <div className="flex gap-2">
          <button className="secondary" onClick={() => setRefresh((n) => n + 1)}>
            Refresh events
          </button>
          <button className="primary" onClick={onAdd}>
            {stadium ? 'Add event' : 'Add showtime'}
          </button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading events…</p>
      ) : !events.length ? (
        <p className="muted">No events yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Event</th>
                <th className="p-2">Date</th>
                <th className="p-2">Sold / available</th>
                <th className="p-2">Blocked</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr className="border-t border-stone-100" key={event.id}>
                  <td className="p-2 font-medium">{event.title}</td>
                  <td className="p-2">
                    {new Date(event.start).toLocaleString()}
                    <small className="block">to {new Date(event.end).toLocaleString()}</small>
                  </td>
                  <td className="p-2">
                    {event.sold} / {event.capacity}
                  </td>
                  <td className="p-2">{event.blocked}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <button className="secondary" onClick={() => onEdit(event)}>
                        Edit
                      </button>
                      <button
                        className="secondary"
                        disabled={Date.parse(event.end) <= Date.now()}
                        onClick={() => onManage(event)}
                      >
                        Manage seats
                      </button>
                      <button
                        className="danger"
                        disabled={event.sold > 0}
                        onClick={() => remove(event, false)}
                      >
                        Delete
                      </button>
                      {event.sold > 0 && (
                        <button className="danger" onClick={() => remove(event, true)}>
                          Cancel event
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
