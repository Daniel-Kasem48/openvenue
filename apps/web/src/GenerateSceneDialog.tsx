import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { layoutSchema, type Layout, type VenueKind } from '@openvenue/contracts';
import { api, json } from './api';
import { Modal } from './Modal';
import { SceneBoundary } from './SceneBoundary';
import Map2D from './Map2D';
const Map3D = lazy(() => import('./Map3D'));
const examples: Record<VenueKind, string> = {
  restaurant:
    'A 24 by 20 metre restaurant with 12 tables for four, a central aisle, a counter by the entrance, and plants in the corners.',
  parking:
    'A two-floor parking garage, 30 by 24 metres per floor, with 20 spaces per floor, two accessible spaces and four EV chargers near the entrance.',
  cinema:
    'A 24 by 30 metre cinema with 8 rows of 12 seats, a wide centre aisle, a screen at the front and a popcorn counter in the foyer. Tickets cost $15.',
  stadium:
    'A compact football stadium with a pitch, four stands, 10 rising rows per stand and 16 seats per row. Each row rises 0.4 metres. North seats cost $25; other stands cost $40.',
};
export function GenerateSceneDialog({
  venueId,
  kind,
  onClose,
  onApply,
}: {
  venueId: string;
  kind: VenueKind;
  onClose: () => void;
  onApply: (layout: Layout) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<{ layout: Layout; summary: string } | null>(null);
  const [floorIndex, setFloorIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return (
    <Modal
      title="Generate a scene with Claude"
      onClose={onClose}
      className="scene-generation-dialog"
    >
      {!result ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const request = new AbortController();
            controller.current = request;
            setBusy(true);
            setError('');
            try {
              const generated = await api<{ layout: Layout; summary: string }>(
                `/venues/${venueId}/generate-scene`,
                { ...json({ prompt }), signal: request.signal },
              );
              setResult({ ...generated, layout: layoutSchema.parse(generated.layout) });
              setFloorIndex(0);
            } catch (error) {
              if (!request.signal.aborted)
                setError(error instanceof Error ? error.message : 'Could not generate the scene.');
            } finally {
              if (!request.signal.aborted) setBusy(false);
            }
          }}
        >
          <p className="muted">
            Describe dimensions, seats or tables, aisles, furnishings, and optional prices. Review
            the result before using it.
          </p>
          <label>
            Describe your scene
            <textarea
              data-autofocus
              required
              minLength={10}
              maxLength={4000}
              rows={6}
              value={prompt}
              disabled={busy}
              placeholder={examples[kind]}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => setPrompt(examples[kind])}
          >
            Use example description
          </button>
          <p className="muted">
            Your description is sent to Anthropic. Generation uses your workspace’s Claude API
            credits.
          </p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p role="status">Claude is designing your scene. This may take up to 90 seconds…</p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? 'Generating…' : 'Generate preview'}
          </button>
        </form>
      ) : (
        <>
          <p>{result.summary}</p>
          <p className="muted">
            {result.layout.floors.length} floors ·{' '}
            {result.layout.floors.reduce((n, f) => n + f.resources.length, 0)} bookable places ·{' '}
            {result.layout.floors.reduce((n, f) => n + f.objects.length, 0)} objects
          </p>
          <label>
            Preview floor
            <select value={floorIndex} onChange={(e) => setFloorIndex(Number(e.target.value))}>
              {result.layout.floors.map((floor, i) => (
                <option key={floor.id} value={i}>
                  {floor.name}
                </option>
              ))}
            </select>
          </label>
          <div className="generated-scene-preview">
            <SceneBoundary
              key={result.layout.floors[floorIndex].id}
              fallback={
                <Map2D
                  floor={result.layout.floors[floorIndex]}
                  kind={kind}
                  busy={[]}
                  editing={false}
                  onSelect={() => {}}
                  onMove={() => {}}
                />
              }
            >
              <Suspense fallback={<p>Preparing preview…</p>}>
                <Map3D
                  key={result.layout.floors[floorIndex].id}
                  floor={result.layout.floors[floorIndex]}
                  kind={kind}
                  busy={[]}
                  onSelect={() => {}}
                />
              </Suspense>
            </SceneBoundary>
          </div>
          <p className="muted">
            Using this scene replaces your current layout draft, including all floors. Nothing is
            saved until you choose Save layout. Review sizes, access routes, and prices in the
            editor.
          </p>
          <div className="panel-actions">
            <button className="secondary" onClick={() => setResult(null)}>
              Revise description
            </button>
            <button className="primary" onClick={() => onApply(result.layout)}>
              Use this layout
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
