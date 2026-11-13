import { useLayoutEffect, useRef } from 'react';
import { Color, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { Floor, Resource } from '@openvenue/contracts';

export function stadiumSeatParts(r: Resource) {
  return [
    [0.4, 0, 0.9, 0.16, 0.8],
    [0.8, 0.35, 0.9, 0.7, 0.15],
    [0.16, 0, 0.5, 0.32, 0.5],
    [-r.elevation / 2, 0, (r.width + 0.5) / r.width, r.elevation, (r.depth + 0.5) / r.depth],
  ] as const;
}
export function StadiumSeats({
  floor,
  selected,
  busy,
  onSelect,
}: {
  floor: Floor;
  selected: string[];
  busy: string[];
  onSelect: (id: string) => void;
}) {
  const seat = useRef<InstancedMesh>(null),
    back = useRef<InstancedMesh>(null),
    base = useRef<InstancedMesh>(null),
    support = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const matrix = new Matrix4(),
      rotation = new Quaternion(),
      point = new Vector3(),
      scale = new Vector3(),
      color = new Color();
    const selectedSet = new Set(selected),
      reserved = new Set(busy);
    for (const [i, r] of floor.resources.entries()) {
      rotation.setFromEuler(new Euler(0, (-r.rotation * Math.PI) / 180, 0));
      for (const [part, [y, z, w, h, d]] of stadiumSeatParts(r).entries()) {
        const mesh = [seat.current, back.current, base.current, support.current][part];
        if (!mesh) continue;
        point
          .set(0, y, z * r.depth)
          .applyQuaternion(rotation)
          .add(new Vector3(r.x - floor.width / 2, r.elevation, r.y - floor.depth / 2));
        matrix.compose(point, rotation, scale.set(w * r.width, h, d * r.depth));
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(
          i,
          color.set(
            mesh === support.current
              ? '#9ca4a5'
              : mesh === base.current
                ? '#343c3c'
                : selectedSet.has(r.id)
                  ? '#a6bc65'
                  : reserved.has(r.id)
                    ? '#b48675'
                    : r.color,
          ),
        );
      }
    }
    for (const mesh of [seat.current, back.current, base.current, support.current])
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
      }
  }, [floor, selected, busy]);
  return (
    <group>
      {[seat, back, base, support].map((ref, i) => (
        <instancedMesh
          key={i}
          ref={ref}
          args={[undefined, undefined, floor.resources.length]}
          castShadow
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            if (e.instanceId !== undefined && e.delta < 4)
              onSelect(floor.resources[e.instanceId].id);
          }}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial roughness={0.7} />
        </instancedMesh>
      ))}
    </group>
  );
}
