import { SceneLabel } from './SceneLabel';
import { StadiumPitch } from './StadiumPitch';
import { Shape } from 'three';
import type { SceneObject } from '@openvenue/contracts';
import { Box, Cylinder, Car } from './Models';
const rampProfile = new Shape().moveTo(0, 0).lineTo(1, 0).lineTo(1, 1).closePath();
export function Scenery({
  object: o,
  editing = false,
}: {
  object: SceneObject;
  editing?: boolean;
}) {
  const { width: w, depth: d, height: h, color: c } = o;
  return (
    <group position={[o.x, 0, o.y]} rotation={[0, (-o.rotation * Math.PI) / 180, 0]}>
      {o.kind === 'label' && <SceneLabel object={o} editing={editing} />}
      {o.kind === 'pitch' && <StadiumPitch width={w} depth={d} height={h} color={c} />}
      {o.kind === 'plant' && (
        <group scale={[w, h / 1.5, d]}>
          <mesh position={[0, 0.25, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.22, 0.5, 24]} />
            <meshStandardMaterial color="#c6ae93" />
          </mesh>
          <Cylinder at={[0, 0.8, 0]} radius={0.035} height={0.9} color="#796545" />
          {Array.from({ length: 7 }, (_, i) => (
            <mesh
              key={i}
              position={[Math.sin(i * 2.4) * 0.19, 0.8 + i * 0.08, Math.cos(i * 2.4) * 0.19]}
              rotation={[i * 0.2, 0, i * 0.7]}
              scale={[0.23, 0.4, 0.12]}
              castShadow
            >
              <sphereGeometry args={[1, 12, 8]} />
              <meshStandardMaterial color={i % 2 ? c : '#6f9164'} />
            </mesh>
          ))}
        </group>
      )}
      {o.kind === 'counter' && (
        <>
          <Box size={[w * 0.96, h * 0.9, d * 0.94]} at={[0, h * 0.45, 0]} color={c} />
          <Box size={[w, h * 0.1, d]} at={[0, h * 0.95, 0]} color="#ede3cf" />
          {[-0.3, 0, 0.3].map((x) => (
            <Box
              key={x}
              size={[0.025, h * 0.65, 0.025]}
              at={[x * w, h * 0.45, d * 0.48]}
              color="#75624b"
            />
          ))}
          <Cylinder at={[w * 0.3, h + 0.1, 0]} radius={0.12} height={0.2} color="#485d50" />
        </>
      )}
      {o.kind === 'sofa' && (
        <>
          <Box size={[w, 0.18, d * 0.85]} at={[0, h * 0.2, 0]} color="#5c5346" />
          <Box
            size={[w * 0.92, h * 0.3, d * 0.83]}
            at={[0, h * 0.43, -d * 0.03]}
            color={c}
            radius={0.12}
          />
          <Box
            size={[w, h * 0.68, d * 0.22]}
            at={[0, h * 0.66, d * 0.38]}
            color={c}
            radius={0.12}
          />
          {[-1, 1].map((x) => (
            <Box
              key={x}
              size={[w * 0.09, h * 0.6, d]}
              at={[x * w * 0.46, h * 0.52, 0]}
              color={c}
              radius={0.09}
            />
          ))}
          {[-0.25, 0.25].map((x) => (
            <Box
              key={x}
              size={[w * 0.35, h * 0.35, d * 0.14]}
              at={[x * w, h * 0.69, d * 0.22]}
              color="#d8c8b4"
              radius={0.08}
            />
          ))}
        </>
      )}
      {o.kind === 'partition' && (
        <>
          <Box size={[w, h, d]} at={[0, h / 2, 0]} color={c} />
          <Box size={[w, 0.06, d + 0.03]} at={[0, h + 0.03, 0]} color="#9f8d75" />
        </>
      )}
      {o.kind === 'column' && (
        <>
          <Box size={[w, h, d]} at={[0, h / 2, 0]} color={c} />
          <Box size={[w + 0.02, 0.28, d + 0.02]} at={[0, 0.3, 0]} color="#e7c369" />
        </>
      )}
      {o.kind === 'door' && (
        <>
          {[-1, 1].map((x) => (
            <Box key={x} size={[0.07, h, d]} at={[x * (w / 2 - 0.035), h / 2, 0]} color="#344a4c" />
          ))}
          <Box size={[w, 0.07, d]} at={[0, h, 0]} color="#344a4c" />
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w - 0.14, h - 0.07, 0.035]} />
            <meshStandardMaterial color={c} transparent opacity={0.2} roughness={0.15} />
          </mesh>
          <Box size={[0.04, 0.4, 0.06]} at={[0.12, h * 0.46, -d * 0.55]} color="#a1b7b5" />
        </>
      )}
      {o.kind === 'screen' && (
        <>
          <Box size={[w, h, d]} at={[0, h / 2 + 0.2, 0]} color="#252b3c" />
          <mesh position={[0, h / 2 + 0.25, d / 2 + 0.01]}>
            <planeGeometry args={[w * 0.94, h * 0.9]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.35} />
          </mesh>
          <Box size={[w * 1.05, 0.2, d * 2]} at={[0, 0.1, 0]} color="#232a3b" />
        </>
      )}
      {o.kind === 'ramp' && (
        <mesh
          position={[w / 2, 0, -d / 2]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={[d, h, w]}
          castShadow
          receiveShadow
        >
          <extrudeGeometry args={[rampProfile, { depth: 1, bevelEnabled: false }]} />
          <meshStandardMaterial color={c} roughness={0.85} />
        </mesh>
      )}
      {o.kind === 'stairs' &&
        Array.from({ length: 8 }, (_, i) => {
          const step = (h * (i + 1)) / 8;
          return (
            <Box
              key={i}
              size={[w, step, d / 8 + 0.01]}
              at={[0, step / 2, -d / 2 + (d / 8) * (i + 0.5)]}
              color={i % 2 ? '#b6b8b0' : c}
              radius={0.008}
            />
          );
        })}
      {o.kind === 'car' && (
        <group scale={[w / 1.8, h / 1.35, d / 4.2]}>
          <Car color={c} />
        </group>
      )}
      {o.kind === 'charger' && (
        <>
          <Box size={[w, h, d]} at={[0, h / 2, 0]} color={c} radius={0.08} />
          <Box size={[w * 0.7, h * 0.25, 0.03]} at={[0, h * 0.72, -d / 2]} color="#1c383c" />
          <Box size={[w * 0.3, 0.06, 0.04]} at={[0, h * 0.73, -d / 2 - 0.025]} color="#b4eac8" />
        </>
      )}
      {o.kind === 'barrier' && (
        <>
          <Box size={[0.3, h, 0.3]} at={[-w * 0.45, h / 2, 0]} color="#4b5a5b" />
          <Box size={[w, 0.12, d]} at={[0, h * 0.8, 0]} color={c} />
          {[-0.3, 0, 0.3].map((x) => (
            <Box key={x} size={[0.25, 0.125, d + 0.01]} at={[x * w, h * 0.8, 0]} color="#eae7d9" />
          ))}
        </>
      )}
    </group>
  );
}
