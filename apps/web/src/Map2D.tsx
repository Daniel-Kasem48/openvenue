import { Object2D } from './scene/Object2D';
import { useRef, useState } from 'react';
import type { Floor, Resource, SceneObject, VenueKind } from '@openvenue/contracts';
type Props = {
  floor: Floor;
  kind: VenueKind;
  selected?: string;
  busy: string[];
  editing: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
};
export default function Map2D({ floor, kind, selected, busy, editing, onSelect, onMove }: Props) {
  const ref = useRef<SVGSVGElement>(null),
    drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const panDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const point = (event: React.PointerEvent) => {
    const svg = ref.current!,
      p = svg.createSVGPoint();
    p.x = event.clientX;
    p.y = event.clientY;
    return p.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const start = (event: React.PointerEvent, r: Resource | SceneObject) => {
    event.stopPropagation();
    onSelect(r.id);
    if (editing) {
      const p = point(event);
      drag.current = { id: r.id, dx: p.x - r.x, dy: p.y - r.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const move = (event: React.PointerEvent) => {
    if (drag.current) {
      const p = point(event),
        r = [...floor.resources, ...(floor.objects ?? [])].find((r) => r.id === drag.current!.id)!;
      const a = (r.rotation * Math.PI) / 180,
        ex = (Math.abs(r.width * Math.cos(a)) + Math.abs(r.depth * Math.sin(a))) / 2,
        ey = (Math.abs(r.width * Math.sin(a)) + Math.abs(r.depth * Math.cos(a))) / 2;
      onMove(
        r.id,
        Math.max(ex, Math.min(floor.width - ex, Math.round((p.x - drag.current.dx) * 4) / 4)),
        Math.max(ey, Math.min(floor.depth - ey, Math.round((p.y - drag.current.dy) * 4) / 4)),
      );
    } else if (panDrag.current) {
      const d = panDrag.current;
      setPan({
        x: d.px - ((event.clientX - d.x) * floor.width) / (ref.current!.clientWidth * zoom),
        y: d.py - ((event.clientY - d.y) * floor.depth) / (ref.current!.clientHeight * zoom),
      });
    }
  };
  return (
    <div className="map-stage">
      <svg
        ref={ref}
        viewBox={`${-2 + pan.x} ${-2 + pan.y} ${(floor.width + 4) / zoom} ${(floor.depth + 4) / zoom}`}
        aria-label="Interactive floor plan"
        onPointerMove={move}
        onPointerUp={() => {
          drag.current = null;
          panDrag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
          panDrag.current = null;
        }}
        onPointerDown={(e) => {
          panDrag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
      >
        <defs>
          <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="0.025" fill="#ccd5cd" />
          </pattern>
        </defs>
        <rect
          x="0"
          y="0"
          width={floor.width}
          height={floor.depth}
          rx="0.3"
          fill="#fafbf7"
          stroke="#a3b3a7"
          strokeWidth="0.18"
        />
        <rect
          x="0.1"
          y="0.1"
          width={floor.width - 0.2}
          height={floor.depth - 0.2}
          fill="url(#grid)"
        />
        {kind === 'cinema' && !(floor.objects ?? []).some((o) => o.kind === 'screen') && (
          <>
            <rect
              x={floor.width * 0.2}
              y="1"
              width={floor.width * 0.6}
              height="0.25"
              rx="0.1"
              fill="#96a89e"
            />
            <text x={floor.width / 2} y="2.3" textAnchor="middle" className="map-caption">
              SCREEN
            </text>
          </>
        )}
        {kind === 'parking' && (
          <>
            <path
              d={`M 2 ${floor.depth / 2} H ${floor.width - 2}`}
              stroke="#c7d1c8"
              strokeWidth="0.08"
              strokeDasharray="0.6 0.4"
            />
            <text
              x={floor.width / 2}
              y={floor.depth / 2 - 0.6}
              textAnchor="middle"
              className="map-caption"
            >
              ONE WAY →
            </text>
          </>
        )}
        {(floor.objects ?? []).map((o) => (
          <g
            key={o.id}
            transform={'translate(' + o.x + ' ' + o.y + ') rotate(' + o.rotation + ')'}
            role={editing ? 'button' : undefined}
            tabIndex={editing ? 0 : undefined}
            aria-label={editing ? 'Select ' + o.label : undefined}
            onKeyDown={(e) => {
              if (editing && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(o.id);
              }
            }}
            onPointerDown={(e) => {
              if (editing) start(e, o);
            }}
            style={{
              pointerEvents: editing ? 'auto' : 'none',
              cursor: editing ? 'grab' : 'default',
            }}
          >
            <Object2D object={o} />
            {selected === o.id && (
              <rect
                x={-o.width / 2 - 0.08}
                y={-o.depth / 2 - 0.08}
                width={o.width + 0.16}
                height={o.depth + 0.16}
                fill="none"
                stroke="#476a40"
                strokeWidth=".07"
                strokeDasharray=".15 .08"
              />
            )}
          </g>
        ))}
        {floor.resources.map((r) => {
          const unavailable = busy.includes(r.id),
            active = selected === r.id;
          return (
            <g
              key={r.id}
              role="button"
              tabIndex={0}
              aria-label={`Select ${r.label}`}
              aria-pressed={active}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(r.id);
                }
              }}
              onPointerDown={(e) => start(e, r)}
              transform={`translate(${r.x} ${r.y}) rotate(${r.rotation})`}
              className="map-resource"
              style={{ cursor: editing ? 'grab' : 'pointer' }}
            >
              {r.kind === 'table' &&
                Array.from({ length: r.capacity > 2 ? 4 : 2 }, (_, i) => (
                  <rect
                    key={i}
                    x={i % 2 === 0 ? -r.width / 2 - 0.28 : r.width / 2 - 0.1}
                    y={r.capacity > 2 ? (i < 2 ? -0.55 : 0.15) : -0.25}
                    width="0.38"
                    height="0.5"
                    rx="0.12"
                    fill={active ? '#c9df92' : '#d4ddd2'}
                  />
                ))}
              {r.shape === 'round' ? (
                <ellipse
                  rx={r.width / 2}
                  ry={r.depth / 2}
                  fill={active ? '#e8cfa2' : unavailable ? '#dcc0ac' : '#d6ba91'}
                  stroke={active ? '#536d3e' : '#ab8d65'}
                  strokeWidth=".06"
                />
              ) : (
                <rect
                  x={-r.width / 2}
                  y={-r.depth / 2}
                  width={r.width}
                  height={r.depth}
                  rx={r.kind === 'space' ? 0.08 : 0.22}
                  fill={active ? '#d9ecae' : unavailable ? '#eee0d5' : '#e0e9dd'}
                  stroke={active ? '#35543a' : unavailable ? '#bb9d85' : '#94ac91'}
                  strokeWidth={active ? 0.1 : 0.05}
                />
              )}
              {r.kind === 'seat' && (
                <rect
                  x={-r.width / 2 + 0.05}
                  y={r.depth / 2 - 0.25}
                  width={r.width - 0.1}
                  height="0.2"
                  rx="0.05"
                  fill={active ? '#557844' : '#a6bba0'}
                />
              )}
              <text
                y={r.kind === 'seat' ? 0.08 : 0}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={r.kind === 'seat' ? 0.27 : 0.38}
                fill="#274233"
                fontWeight="600"
                pointerEvents="none"
              >
                {r.label}
              </text>
              {r.kind !== 'seat' && (
                <text
                  y="0.5"
                  textAnchor="middle"
                  fontSize="0.24"
                  fill="#647763"
                  pointerEvents="none"
                >
                  {r.kind === 'table'
                    ? `${r.capacity} guests`
                    : r.ev
                      ? 'EV'
                      : r.accessible
                        ? 'ACCESSIBLE'
                        : 'PARKING'}
                </text>
              )}
            </g>
          );
        })}
        <text x={floor.width / 2} y={floor.depth + 1} textAnchor="middle" className="map-caption">
          ENTRANCE ↑
        </text>
      </svg>
      <div className="map-zoom">
        <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}>
          −
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          aria-label="Reset map view"
        >
          Fit
        </button>
        <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
          +
        </button>
      </div>
      <span className="map-scale">
        {floor.width} × {floor.depth} m ·{' '}
        {editing ? 'Drag to move · 0.25 m grid' : 'Drag background to pan'}
      </span>
    </div>
  );
}
