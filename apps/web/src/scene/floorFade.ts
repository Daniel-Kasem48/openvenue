import { Vector2, type MeshStandardMaterial } from 'three';

export function floorFade(width: number, depth: number): MeshStandardMaterial['onBeforeCompile'] {
  return (shader) => {
    shader.uniforms.floorHalfSize = { value: new Vector2(width / 2, depth / 2) };
    shader.vertexShader = `varying vec2 floorPosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nfloorPosition = (modelMatrix * vec4(position, 1.0)).xz;',
    );
    shader.fragmentShader = `varying vec2 floorPosition;
      uniform vec2 floorHalfSize;\n${shader.fragmentShader}`.replace(
      '#include <alphamap_fragment>',
      `#include <alphamap_fragment>
      vec2 edgeDistance = floorHalfSize - abs(floorPosition);
      diffuseColor.a *= smoothstep(0.0, 0.65, min(edgeDistance.x, edgeDistance.y));`,
    );
  };
}
