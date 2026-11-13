import { RoundedBox } from '@react-three/drei';
import type { Resource } from '@openvenue/contracts';
type Vec3 = [number, number, number];
export function Box({
  size,
  at = [0, 0, 0],
  color,
  radius = 0.04,
  rotation = [0, 0, 0],
  metalness = 0,
}: {
  size: Vec3;
  at?: Vec3;
  color: string;
  radius?: number;
  rotation?: Vec3;
  metalness?: number;
}) {
  if (radius <= 0.04)
    return (
      <mesh position={at} rotation={rotation} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          roughness={metalness ? 0.35 : 0.75}
          metalness={metalness}
        />
      </mesh>
    );
  return (
    <RoundedBox
      args={size}
      position={at}
      rotation={rotation}
      radius={Math.min(radius, ...size.map((v) => v / 3))}
      smoothness={2}
      bevelSegments={1}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={color}
        roughness={metalness ? 0.35 : 0.75}
        metalness={metalness}
      />
    </RoundedBox>
  );
}
export function Cylinder({
  at = [0, 0, 0],
  radius,
  height,
  color,
  rotation = [0, 0, 0],
}: {
  at?: Vec3;
  radius: number;
  height: number;
  color: string;
  rotation?: Vec3;
}) {
  return (
    <mesh position={at} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, 20]} />
      <meshStandardMaterial color={color} roughness={0.65} />
    </mesh>
  );
}
export function DiningChair({ color = '#43665e' }: { color?: string }) {
  return (
    <group>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <Box
            key={x * 10 + z}
            size={[0.045, 0.45, 0.045]}
            at={[x * 0.22, 0.225, z * 0.21]}
            color="#715440"
          />
        )),
      )}
      <Box size={[0.55, 0.12, 0.52]} at={[0, 0.49, 0]} color={color} radius={0.07} />
      <Box
        size={[0.55, 0.46, 0.09]}
        at={[0, 0.77, 0.24]}
        color={color}
        radius={0.06}
        rotation={[-0.08, 0, 0]}
      />
      <Box size={[0.42, 0.02, 0.02]} at={[0, 0.84, 0.292]} color="#a9b8a8" />
    </group>
  );
}
export function DiningTable({ resource, color }: { resource: Resource; color: string }) {
  const { width: w, depth: d, capacity, shape } = resource;
  // shortcut: show up to eight chairs per table; use instancing before supporting banquet-scale layouts.
  const seats = Math.min(capacity, 8);
  const positions = Array.from({ length: seats }, (_, i) => {
    const angle =
      shape === 'round' ? (i / seats) * Math.PI * 2 : i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
    if (shape === 'round')
      return { x: Math.sin(angle) * (w / 2 + 0.35), z: Math.cos(angle) * (d / 2 + 0.35), angle };
    const side = i % 2 === 0 ? 1 : -1,
      index = Math.floor(i / 2),
      count = Math.ceil(seats / 2);
    return {
      x: side * (w / 2 + 0.36),
      z: (index - (count - 1) / 2) * Math.min(0.65, d / count),
      angle,
    };
  });
  return (
    <group>
      {shape === 'round' ? (
        <>
          <mesh position={[0, 0.83, 0]} scale={[w / 2, 1, d / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[1, 1, 0.12, 48]} />
            <meshStandardMaterial color="#b98d64" roughness={0.6} />
          </mesh>
          <Cylinder at={[0, 0.4, 0]} radius={0.12} height={0.8} color="#3e4f46" />
          <Cylinder at={[0, 0.05, 0]} radius={0.43} height={0.07} color="#3e4f46" />
        </>
      ) : (
        <>
          <Box size={[w, 0.13, d]} at={[0, 0.83, 0]} color="#bd976e" radius={0.1} />
          {[-1, 1].flatMap((x) =>
            [-1, 1].map((z) => (
              <Box
                key={x * 10 + z}
                size={[0.09, 0.77, 0.09]}
                at={[x * w * 0.38, 0.385, z * d * 0.37]}
                color="#584c3d"
              />
            )),
          )}
          <Box size={[0.35, 0.012, d * 0.98]} at={[0, 0.905, 0]} color="#e4d8bf" radius={0.005} />
        </>
      )}
      {positions.map((p, i) => (
        <group key={i}>
          <group position={[p.x, 0, p.z]} rotation={[0, p.angle, 0]}>
            <DiningChair color={color} />
          </group>
          <group position={[p.x * 0.53, 0.91, p.z * 0.53]}>
            <Cylinder radius={0.18} height={0.025} color="#f9f5e9" />
            <Cylinder at={[0, 0.018, 0]} radius={0.135} height={0.012} color="#dedbc9" />
            <Box at={[0.23, 0, 0]} size={[0.022, 0.01, 0.2]} color="#b6b9b4" metalness={0.7} />
            <Cylinder at={[-0.19, 0.065, 0.13]} radius={0.045} height={0.12} color="#c6dddc" />
          </group>
        </group>
      ))}
      <Cylinder at={[0, 1.01, 0]} radius={0.065} height={0.22} color="#e4ded0" />
      <mesh position={[0, 1.18, 0]} castShadow>
        <sphereGeometry args={[0.11, 12, 8]} />
        <meshStandardMaterial color="#5f8051" />
      </mesh>
    </group>
  );
}
export function CinemaChair({ color = '#935460' }: { color?: string }) {
  return (
    <group>
      <Box size={[0.72, 0.17, 0.7]} at={[0, 0.16, 0]} color="#272b35" />
      <Box size={[0.68, 0.2, 0.65]} at={[0, 0.47, -0.05]} color={color} radius={0.1} />
      <Box
        size={[0.7, 0.78, 0.22]}
        at={[0, 0.81, 0.27]}
        color={color}
        radius={0.1}
        rotation={[-0.12, 0, 0]}
      />
      <Box size={[0.54, 0.26, 0.08]} at={[0, 1.04, 0.12]} color={color} radius={0.06} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box size={[0.13, 0.4, 0.7]} at={[side * 0.41, 0.48, 0]} color="#30313b" radius={0.05} />
          <Box
            size={[0.15, 0.09, 0.71]}
            at={[side * 0.41, 0.73, 0]}
            color="#47414b"
            radius={0.04}
          />
          <Cylinder at={[side * 0.41, 0.785, -0.2]} radius={0.047} height={0.015} color="#151a23" />
        </group>
      ))}
    </group>
  );
}
export function Car({ color = '#547b91' }: { color?: string }) {
  return (
    <group>
      <Box
        size={[1.68, 0.48, 3.8]}
        at={[0, 0.48, 0]}
        color={color}
        radius={0.18}
        metalness={0.35}
      />
      <Box
        size={[1.53, 0.3, 1.25]}
        at={[0, 0.74, -1.15]}
        color={color}
        radius={0.12}
        metalness={0.35}
      />
      <Box
        size={[1.42, 0.6, 1.9]}
        at={[0, 1.01, 0.18]}
        color="#263f49"
        radius={0.21}
        metalness={0.3}
      />
      <Box
        size={[1.28, 0.09, 1.5]}
        at={[0, 1.32, 0.24]}
        color={color}
        radius={0.1}
        metalness={0.3}
      />
      <Box size={[1.53, 0.27, 0.7]} at={[0, 0.74, 1.49]} color={color} radius={0.12} />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <group key={x * 10 + z} position={[x * 0.79, 0.34, z * 1.22]}>
            <Cylinder radius={0.32} height={0.2} color="#222c32" rotation={[0, 0, Math.PI / 2]} />
            <Cylinder
              at={[x * 0.11, 0, 0]}
              radius={0.18}
              height={0.025}
              color="#b5bfc1"
              rotation={[0, 0, Math.PI / 2]}
            />
            <Cylinder
              at={[x * 0.13, 0, 0]}
              radius={0.065}
              height={0.027}
              color="#4a5a61"
              rotation={[0, 0, Math.PI / 2]}
            />
          </group>
        )),
      )}
      {[-1, 1].map((x) => (
        <group key={x}>
          <Box
            size={[0.43, 0.11, 0.05]}
            at={[x * 0.5, 0.68, -1.91]}
            color="#f4e9c1"
            radius={0.02}
          />
          <Box size={[0.4, 0.1, 0.05]} at={[x * 0.5, 0.65, 1.91]} color="#b5534c" radius={0.02} />
          <Box size={[0.17, 0.13, 0.28]} at={[x * 0.82, 1, -0.55]} color={color} />
        </group>
      ))}
      <Box size={[0.55, 0.16, 0.03]} at={[0, 0.42, -1.93]} color="#c8d1cd" />
    </group>
  );
}
export function ParkingBay({
  resource,
  color,
  reserved,
}: {
  resource: Resource;
  color: string;
  reserved: boolean;
}) {
  const w = resource.width,
    d = resource.depth;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={color} transparent opacity={0.2} />
      </mesh>
      {[-1, 1].map((x) => (
        <Box
          key={x}
          size={[0.065, 0.015, d]}
          at={[x * (w / 2 - 0.06), 0.025, 0]}
          color="#e8e9d9"
          radius={0.002}
        />
      ))}
      <Box size={[w, 0.015, 0.065]} at={[0, 0.025, -d / 2 + 0.06]} color="#e8e9d9" radius={0.002} />
      <Box size={[w * 0.55, 0.13, 0.15]} at={[0, 0.08, -d * 0.35]} color="#d6c27e" />
      {resource.accessible && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0.15]}>
          <ringGeometry args={[0.31, 0.38, 24]} />
          <meshStandardMaterial color="#c9e7ec" />
        </mesh>
      )}
      {reserved && (
        <group scale={[w / 2.6, 1, d / 5]}>
          <Car color="#b08273" />
        </group>
      )}
    </group>
  );
}
