import { useState } from 'react';
import type { Venue } from '@openvenue/contracts';
import { Modal } from './Modal';

export function VenueSettings({
  venue,
  working,
  error,
  onClose,
  onSave,
}: {
  venue: Venue;
  working: boolean;
  error: string;
  onClose: () => void;
  onSave: (patch: { name?: string; archived?: boolean }) => void;
}) {
  const [name, setName] = useState(venue.name);
  const [confirmation, setConfirmation] = useState('');
  return (
    <Modal title="Venue settings" onClose={onClose}>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ name: name.trim() });
        }}
      >
        <label>
          Venue name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          className="primary full"
          disabled={working || !name.trim() || name.trim() === venue.name}
        >
          Save settings
        </button>
      </form>
      <section className="mt-6 border-t border-stone-200 pt-4">
        <h3>Archive venue</h3>
        <p className="muted my-2">
          Hide this venue from guests and stop new reservations. Existing reservations stay in your
          records. You can restore it from the sidebar.
        </p>
        <label>
          Type {venue.name} to confirm
          <input
            aria-label="Confirm venue name"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <button
          className="secondary danger full"
          disabled={working || confirmation !== venue.name}
          onClick={() => onSave({ archived: true })}
        >
          Archive venue
        </button>
      </section>
    </Modal>
  );
}
