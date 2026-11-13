import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { SceneObject } from '@openvenue/contracts';

export function SceneLabel({ object: o }: { object: SceneObject }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;
    context.fillStyle = o.color;
    context.beginPath();
    context.roundRect(8, 8, 496, 240, 32);
    context.fill();
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = 'bold 170px sans-serif';
    const fontSize = Math.min(170, (170 * 450) / Math.max(1, context.measureText(o.label).width));
    context.font = `bold ${fontSize}px sans-serif`;
    context.fillText(o.label, 256, 138);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    return result;
  }, [o.label, o.color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite
      position={[0, o.height, 0]}
      scale={[o.width, o.depth, 1]}
      renderOrder={10}
      raycast={() => {}}
    >
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}
