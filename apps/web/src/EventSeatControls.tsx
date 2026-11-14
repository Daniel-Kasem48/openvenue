import { useEffect, useState } from 'react';
import { seatLocation, type Floor } from '@openvenue/contracts';
import { api, json } from './api';
export function EventSeatControls({
  venueId,
  showId,
  floor,
  selectedIds,
  blockedIds,
  scope,
  onScope,
  onClear,
  onChanged,
  run,
  working,
}: {
  venueId: string;
  showId: string;
  floor: Floor;
  selectedIds: string[];
  blockedIds: string[];
  scope: 'seat' | 'row' | 'block';
  onScope: (scope: 'seat' | 'row' | 'block') => void;
  onClear: () => void;
  onChanged: (message: string) => void;
  run: (work: () => Promise<void>) => Promise<void>;
  working: boolean;
}) {
  const [reason, setReason] = useState('');
  const [blocks, setBlocks] = useState<{ resourceId: string; reason: string }[]>([]);
  const [loadError, setLoadError] = useState('');
  const path = `/venues/${venueId}/shows/${showId}/blocks`;
  useEffect(() => {
    const controller = new AbortController();
    api<typeof blocks>(path, { signal: controller.signal })
      .then((value) => {
        setBlocks(value);
        setLoadError('');
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setLoadError(e.message);
      });
    return () => controller.abort();
  }, [path, blockedIds]);
  const selected = floor.resources.filter((r) => selectedIds.includes(r.id));
  const releaseCount = blocks.filter((b) => selectedIds.includes(b.resourceId)).length;
  const change = (release: boolean) =>
    run(async () => {
      await api(path, {
        ...json(release ? { resourceIds: selectedIds } : { resourceIds: selectedIds, reason }),
        method: release ? 'DELETE' : 'POST',
      });
      onChanged(
        `${release ? releaseCount : selectedIds.length} seats ${release ? 'released' : 'blocked'} for this event.`,
      );
      setBlocks(await api<typeof blocks>(path));
    });
  return (
    <section className="event-seat-controls" aria-label="Event seat controls">
      <div className="eyebrow">EVENT INVENTORY</div>
      <h3>Manage event seats</h3>
      <p className="muted">Blocks apply only to this event. Existing bookings are protected.</p>
      <label>
        Selection scope
        <select
          value={scope}
          onChange={(e) => {
            onScope(e.target.value as typeof scope);
            onClear();
          }}
        >
          <option value="seat">Individual seats</option>
          <option value="row">Whole row within a block</option>
          <option value="block">Whole block</option>
        </select>
      </label>
      <p aria-live="polite">{selected.length} seats selected</p>
      <p className="muted">Click seats on the 2D or 3D map to toggle your selection.</p>
      <div className="managed-seat-list">
        {selected.map((r) => (
          <div key={r.id}>{seatLocation(r)}</div>
        ))}
      </div>
      <button className="text-button" onClick={onClear} disabled={!selected.length}>
        Clear selection
      </button>
      <label>
        Reason for blocking
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={240}
          placeholder="e.g. camera platform"
        />
      </label>
      <small className="muted">Visible to staff only.</small>
      <button
        className="primary full"
        disabled={working || !selected.length || !reason.trim()}
        onClick={() => void change(false)}
      >
        Block selected seats
      </button>
      <button
        className="secondary full"
        disabled={working || !releaseCount}
        onClick={() => void change(true)}
      >
        Release selected seats
      </button>
      {loadError && <p role="alert">{loadError}</p>}
      {blocks.length > 0 && (
        <details>
          <summary>{blocks.length} blocked seats · staff reasons</summary>
          <div className="managed-seat-list">
            {blocks.map((b) => (
              <p key={b.resourceId}>
                {floor.resources.find((r) => r.id === b.resourceId)
                  ? seatLocation(floor.resources.find((r) => r.id === b.resourceId)!)
                  : 'Seat on another floor'}
                <small>{b.reason}</small>
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
