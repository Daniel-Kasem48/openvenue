import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Floor, VenueKind } from '@openvenue/contracts';
export default function Map3D({
  floor,
  kind,
  selected,
  busy,
  onSelect,
}: {
  floor: Floor;
  kind: VenueKind;
  selected?: string;
  busy: string[];
  onSelect: (id: string) => void;
}) {
  const size = Math.max(floor.width, floor.depth);
  return (
    <div className="map-stage three-stage" aria-label="3D floor plan">
      <Canvas shadows camera={{ position: [size * 0.8, size * 0.9, size * 0.9], fov: 45 }}>
        <color attach="background" args={['#f0f3ed']} />
        <ambientLight intensity={1.4} />
        <directionalLight
          position={[8, 20, 10]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[floor.width, floor.depth]} />
          <meshStandardMaterial color="#fafbf5" />
        </mesh>
        <mesh position={[0, 0.2, -floor.depth / 2]}>
          <boxGeometry args={[floor.width, 0.4, 0.15]} />
          <meshStandardMaterial color="#a6b5a6" />
        </mesh>
        <mesh position={[-floor.width / 2, 0.2, 0]}>
          <boxGeometry args={[0.15, 0.4, floor.depth]} />
          <meshStandardMaterial color="#a6b5a6" />
        </mesh>
        {kind === 'cinema' && (
          <mesh position={[0, 1.3, 1 - floor.depth / 2]}>
            <boxGeometry args={[floor.width * 0.6, 2, 0.15]} />
            <meshStandardMaterial color="#eee9d5" />
          </mesh>
        )}
        {floor.resources.map((r) => {
          const color = selected === r.id ? '#a9cd66' : busy.includes(r.id) ? '#c8ac97' : '#90ab8b',
            height = r.kind === 'table' ? 0.8 : r.kind === 'seat' ? 0.5 : 0.04;
          return (
            <group
              key={r.id}
              position={[r.x - floor.width / 2, 0, r.y - floor.depth / 2]}
              rotation={[0, (-r.rotation * Math.PI) / 180, 0]}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(r.id);
              }}
            >
              <mesh castShadow receiveShadow position={[0, height, 0]}>
                <boxGeometry
                  args={[
                    r.width,
                    r.kind === 'table' ? 0.14 : r.kind === 'seat' ? 0.35 : 0.06,
                    r.depth,
                  ]}
                />
                <meshStandardMaterial color={color} />
              </mesh>
              {r.kind === 'table' &&
                [-1, 1].flatMap((x) =>
                  [-1, 1].map((y) => (
                    <mesh
                      key={`${x}-${y}`}
                      position={[x * r.width * 0.35, 0.4, y * r.depth * 0.35]}
                      castShadow
                    >
                      <boxGeometry args={[0.09, 0.8, 0.09]} />
                      <meshStandardMaterial color="#5a6c50" />
                    </mesh>
                  )),
                )}
              {r.kind === 'seat' && (
                <mesh position={[0, 0.8, r.depth * 0.35]} castShadow>
                  <boxGeometry args={[r.width, 0.65, 0.18]} />
                  <meshStandardMaterial color={color} />
                </mesh>
              )}
              {r.kind === 'space' && (
                <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.4, 0.46, 32]} />
                  <meshBasicMaterial color="#fafbf5" />
                </mesh>
              )}
            </group>
          );
        })}
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          minDistance={4}
          maxDistance={size * 3}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
      <span className="map-scale">Drag to orbit · Scroll to zoom · Click to select</span>
    </div>
  );
}
