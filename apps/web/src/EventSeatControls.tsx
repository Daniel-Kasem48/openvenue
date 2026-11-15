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
    <section
      className="event-seat-controls mt-2 border-t border-stone-100 pt-5"
      aria-label="Event seat controls"
    >
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
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p aria-live="polite" className="text-[13px] font-semibold text-ink">
          {selected.length} seats selected
        </p>
        <button className="text-button -mr-2" onClick={onClear} disabled={!selected.length}>
          Clear selection
        </button>
      </div>
      <p className="muted mb-2 text-xs">
        Click seats on the 2D or 3D map to toggle your selection.
      </p>
      {selected.length > 0 && (
        <div className="managed-seat-list mb-4 flex max-h-40 flex-wrap gap-1.5 overflow-auto">
          {selected.map((r) => (
            <span
              key={r.id}
              className="rounded-full bg-sprout-100 px-2.5 py-1 text-xs font-medium text-forest-800 ring-1 ring-sprout-300"
            >
              {seatLocation(r)}
            </span>
          ))}
        </div>
      )}
      <label>
        Reason for blocking
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={240}
          placeholder="e.g. camera platform"
        />
      </label>
      <small className="-mt-2.5 mb-4 text-xs text-stone-400">Visible to staff only.</small>
      <button
        className="primary full mb-2"
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
      {loadError && (
        <p className="field-error" role="alert">
          {loadError}
        </p>
      )}
      {blocks.length > 0 && (
        <details className="section mt-4">
          <summary>{blocks.length} blocked seats · staff reasons</summary>
          <div className="managed-seat-list max-h-48 divide-y divide-stone-100 overflow-auto text-[13px]">
            {blocks.map((b) => (
              <p key={b.resourceId} className="py-2 font-medium text-ink">
                {floor.resources.find((r) => r.id === b.resourceId)
                  ? seatLocation(floor.resources.find((r) => r.id === b.resourceId)!)
                  : 'Seat on another floor'}
                <small className="mt-0.5 font-normal text-stone-500">{b.reason}</small>
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
