import { Color } from 'three';

export function StadiumPitch({
  width,
  depth,
  height,
  color,
}: {
  width: number;
  depth: number;
  height: number;
  color: string;
}) {
  return (
    <group scale={[width / 38, height / 2, depth / 24]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[36, 24]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-15 + i * 6, 0.025, 0]}
          receiveShadow
        >
          <planeGeometry args={[3, 24]} />
          <meshStandardMaterial color={new Color(color).multiplyScalar(0.87)} roughness={1} />
        </mesh>
      ))}
      {[
        [0, -12, 36, 0.12],
        [0, 12, 36, 0.12],
        [-18, 0, 0.12, 24],
        [18, 0, 0.12, 24],
        [0, 0, 0.12, 24],
        [-13, 0, 0.12, 12],
        [13, 0, 0.12, 12],
        [-15.5, -6, 5, 0.12],
        [-15.5, 6, 5, 0.12],
        [15.5, -6, 5, 0.12],
        [15.5, 6, 5, 0.12],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.035, z]}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial
            color="#f1f5e7"
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <ringGeometry args={[2.9, 3, 48]} />
        <meshBasicMaterial
          color="#f1f5e7"
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      {[-18.5, 18.5].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 2, 0]}>
            <boxGeometry args={[0.15, 0.15, 5]} />
            <meshStandardMaterial color="white" />
          </mesh>
          {[-2.5, 2.5].map((z) => (
            <mesh key={z} position={[0, 1, z]}>
              <boxGeometry args={[0.15, 2, 0.15]} />
              <meshStandardMaterial color="white" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
