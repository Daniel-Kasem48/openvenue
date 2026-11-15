import { RotateCcw } from 'lucide-react';
import type { Group } from 'three';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Bounds, OrbitControls, useBounds, useCursor, TransformControls } from '@react-three/drei';
import { seatRows } from '@openvenue/contracts';
import { SceneLabel } from './scene/SceneLabel';
import type { Floor, Resource, VenueKind } from '@openvenue/contracts';
import { CinemaChair, DiningTable, ParkingBay } from './scene/Models';
import { StadiumSeats } from './scene/StadiumSeats';
import { Scenery } from './scene/Scenery';
type Viewpoint = 'overview' | 'top' | 'north' | 'south' | 'east' | 'west';
function FitCamera({ revision, viewpoint }: { revision: number; viewpoint: Viewpoint }) {
  const bounds = useBounds();
  useEffect(() => {
    bounds.refresh().clip();
    const { center, distance } = bounds.getSize();
    const directions: Record<Viewpoint, [number, number, number]> = {
      overview: [0.65, 0.75, 0.85],
      top: [0, 1, 0.001],
      north: [0, 0.35, -1],
      south: [0, 0.35, 1],
      east: [1, 0.35, 0],
      west: [-1, 0.35, 0],
    };
    const direction = directions[viewpoint],
      length = Math.hypot(...direction);
    bounds
      .moveTo([
        center.x + (direction[0] / length) * distance,
        center.y + (direction[1] / length) * distance,
        center.z + (direction[2] / length) * distance,
      ])
      .lookAt({ target: center });
  }, [bounds, revision, viewpoint]);
  return null;
}
function ResourceModel({
  resource: r,
  floor,
  selected,
  reserved,
  blocked,
  onSelect,
}: {
  resource: Resource;
  floor: Floor;
  selected: boolean;
  reserved: boolean;
  blocked: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const color = selected
    ? '#a6bc65'
    : blocked
      ? '#8c96a3'
      : reserved
        ? '#b48675'
        : r.kind === 'seat'
          ? r.color
          : r.kind === 'space'
            ? r.ev
              ? '#5d9e86'
              : r.accessible
                ? '#5b8caa'
                : '#a6ada5'
            : '#4c7167';
  return (
    <group
      position={[r.x - floor.width / 2, r.elevation ?? 0, r.y - floor.depth / 2]}
      rotation={[0, (-r.rotation * Math.PI) / 180, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(r.id);
      }}
    >
      {r.elevation > 0 && (
        <mesh position={[0, -r.elevation / 2, 0]} receiveShadow>
          <boxGeometry args={[r.width + 0.5, r.elevation, r.depth + 0.5]} />
          <meshStandardMaterial color="#9ca4a5" />
        </mesh>
      )}
      {(selected || hovered) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.017, 0]}>
          <planeGeometry args={[r.width + 0.5, r.depth + 0.5]} />
          <meshBasicMaterial color={selected ? '#c4d991' : '#e5d8aa'} transparent opacity={0.6} />
        </mesh>
      )}
      {r.kind === 'table' ? (
        <DiningTable resource={r} color={color} />
      ) : r.kind === 'seat' ? (
        <group scale={[r.width / 0.9, 1, r.depth]}>
          <CinemaChair color={color} />
        </group>
      ) : (
        <ParkingBay resource={r} color={color} reserved={reserved} />
      )}
    </group>
  );
}
function MoveHandle({
  item,
  floor,
  onMove,
}: {
  item: Floor['resources'][number] | Floor['objects'][number];
  floor: Floor;
  onMove: (id: string, x: number, y: number) => { x: number; y: number } | undefined;
}) {
  const target = useRef<Group>(null!);
  const controls = useRef<TransformControlsImpl>(null);
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    const instance = controls.current;
    instance?.connect(canvas);
    return () => instance?.dispose();
  }, [canvas]);
  return (
    <>
      <group
        ref={target}
        position={[
          item.x - floor.width / 2,
          'elevation' in item ? item.elevation + 0.5 : item.height / 2,
          item.y - floor.depth / 2,
        ]}
      />
      <TransformControls
        ref={controls}
        object={target}
        mode="translate"
        showY={false}
        translationSnap={0.25}
        size={0.8}
        onObjectChange={() => {
          const position = target.current.position;
          const next = onMove(item.id, position.x + floor.width / 2, position.z + floor.depth / 2);
          if (next) position.set(next.x - floor.width / 2, position.y, next.y - floor.depth / 2);
        }}
      />
    </>
  );
}

export default function Map3D({
  floor,
  kind,
  selected,
  selectedIds = [],
  busy,
  blocked = [],
  onSelect,
  editing = false,
  onMove,
}: {
  floor: Floor;
  kind: VenueKind;
  selected?: string;
  selectedIds?: string[];
  busy: string[];
  blocked?: string[];
  onSelect: (id: string) => void;
  editing?: boolean;
  onMove?: (id: string, x: number, y: number) => { x: number; y: number } | undefined;
}) {
  const item = [...floor.resources, ...floor.objects].find((item) => item.id === selected);
  const size = Math.max(floor.width, floor.depth);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [viewpoint, setViewpoint] = useState<Viewpoint>('overview');
  const dark = kind === 'cinema';
  return (
    <div
      className={'map-stage three-stage ' + (dark ? 'cinema-stage' : '')}
      aria-label="3D floor plan"
    >
      <div className="scene-caption pointer-events-none absolute top-5 left-6 z-[2] flex flex-col gap-1.5 text-ink max-sm:top-4 max-sm:left-4">
        <span className="scene-tag flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-forest-600">
          <i className="live-dot" />
          LIVE 3D
        </span>
        <strong className="font-display text-lg font-semibold tracking-[-0.01em] max-sm:text-[15px]">
          {kind === 'restaurant'
            ? 'A place to gather'
            : kind === 'parking'
              ? 'A smoother arrival'
              : 'The best seat in the house'}
        </strong>
        <small className="text-xs text-stone-500">
          {floor.name} · {floor.resources.length} bookable places
        </small>
        {selected && <span className="object-label mt-1 self-start">Selected: {item?.label}</span>}
      </div>
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [size * 0.65, size * 0.75, size * 0.85], fov: 42 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[dark ? '#232b39' : '#eceee8']} />
        <hemisphereLight args={[dark ? '#d5d9f2' : '#fff6e5', dark ? '#42445c' : '#a6b5a0', 2]} />
        <directionalLight
          position={[8, 18, 10]}
          intensity={dark ? 2 : 3.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-size}
          shadow-camera-right={size}
          shadow-camera-top={size}
          shadow-camera-bottom={-size}
          shadow-bias={-0.0005}
        />
        <Suspense fallback={null}>
          <Bounds fit clip margin={1.15} maxDuration={0.35}>
            <FitCamera revision={cameraRevision} viewpoint={viewpoint} />
            <group>
              <mesh receiveShadow position={[0, -0.15, 0]}>
                <boxGeometry args={[floor.width + 0.4, 0.3, floor.depth + 0.4]} />
                <meshStandardMaterial
                  color={dark ? '#333545' : kind === 'parking' ? '#747e80' : '#d4c5ac'}
                  roughness={0.92}
                />
              </mesh>
              {Array.from({ length: Math.ceil(floor.width / 2) }, (_, i) => (
                <mesh
                  key={i}
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[-floor.width / 2 + i * 2 + 1, 0.001, 0]}
                  receiveShadow
                >
                  <planeGeometry args={[1.96, floor.depth]} />
                  <meshStandardMaterial
                    color={
                      dark
                        ? i % 2
                          ? '#383647'
                          : '#353342'
                        : kind === 'parking'
                          ? i % 2
                            ? '#7e8989'
                            : '#7b8686'
                          : i % 2
                            ? '#ded1b9'
                            : '#d8c9af'
                    }
                    roughness={0.9}
                  />
                </mesh>
              ))}
              <mesh position={[0, 0.6, -floor.depth / 2]} castShadow receiveShadow>
                <boxGeometry args={[floor.width, 1.2, 0.18]} />
                <meshStandardMaterial color={dark ? '#444558' : '#d7d8c9'} />
              </mesh>
              <mesh position={[-floor.width / 2, 0.6, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.18, 1.2, floor.depth]} />
                <meshStandardMaterial color={dark ? '#444558' : '#d7d8c9'} />
              </mesh>
              <group position={[-floor.width / 2, 0, -floor.depth / 2]}>
                {(floor.objects ?? []).map((o) => (
                  <group
                    key={o.id}
                    onClick={
                      editing
                        ? (e) => {
                            e.stopPropagation();
                            if (e.delta < 4) onSelect(o.id);
                          }
                        : undefined
                    }
                  >
                    <Scenery object={o} editing={editing} />
                  </group>
                ))}
              </group>
              {seatRows(floor).map((row) => (
                <group
                  key={JSON.stringify([row.section, row.row])}
                  position={[row.x - floor.width / 2, 0, row.y - floor.depth / 2]}
                >
                  <SceneLabel
                    object={{
                      id: `row-${row.section}-${row.row}`,
                      kind: 'label',
                      label: row.row,
                      x: 0,
                      y: 0,
                      rotation: 0,
                      width: 1.1,
                      depth: 0.7,
                      height: row.elevation + 1,
                      color: '#244c3c',
                    }}
                  />
                </group>
              ))}
              {kind === 'stadium' ? (
                <StadiumSeats
                  floor={floor}
                  selected={selected ? [...selectedIds, selected] : selectedIds}
                  busy={busy}
                  blocked={blocked}
                  onSelect={onSelect}
                />
              ) : (
                floor.resources.map((r) => (
                  <ResourceModel
                    key={r.id}
                    resource={r}
                    floor={floor}
                    selected={selected === r.id || selectedIds.includes(r.id)}
                    reserved={busy.includes(r.id)}
                    blocked={blocked.includes(r.id)}
                    onSelect={onSelect}
                  />
                ))
              )}
            </group>
          </Bounds>
        </Suspense>
        {editing && item && onMove && (
          <MoveHandle key={item.id} item={item} floor={floor} onMove={onMove} />
        )}
        <OrbitControls
          makeDefault
          minDistance={3}
          maxDistance={size * 3}
          maxPolarAngle={Math.PI / 2.02}
          enableDamping
        />
      </Canvas>
      <div
        className="camera-viewpoints absolute top-4 right-4 z-[2] flex max-w-[230px] flex-wrap justify-end gap-1 max-sm:top-[88px] max-sm:right-4 max-sm:left-4 max-sm:max-w-none max-sm:justify-start"
        aria-label="Camera viewpoints"
      >
        {(['overview', 'top', 'north', 'south', 'east', 'west'] as const).map((v) => (
          <button
            key={v}
            className={`float-button ${viewpoint === v ? 'bg-forest-800! text-white! ring-forest-900!' : ''}`}
            aria-label={`${v[0].toUpperCase() + v.slice(1)} camera view`}
            onClick={() => {
              setViewpoint(v);
              setCameraRevision((n) => n + 1);
            }}
          >
            {v}
          </button>
        ))}
      </div>
      <button
        className="camera-reset float-button absolute right-4 bottom-4 px-3 py-2 normal-case"
        aria-label="Reset 3D camera"
        onClick={() => {
          setViewpoint('overview');
          setCameraRevision((v) => v + 1);
        }}
      >
        <RotateCcw className="size-4 inline-block shrink-0" aria-hidden="true" strokeWidth={1.75} />{' '}
        Reset view
      </button>
      <span className="map-scale">
        {editing && <span>Select an item · Drag its arrows to move · </span>}
        <kbd>Ctrl</kbd> + drag to pan · Drag to rotate · Pinch/scroll to zoom
      </span>
    </div>
  );
}
