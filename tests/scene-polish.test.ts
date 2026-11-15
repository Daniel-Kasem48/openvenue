import { Children, isValidElement, type ReactNode, type ReactElement } from 'react';
import { expect, it } from 'vitest';
import { Color, ShaderLib, type MeshStandardMaterial } from 'three';
import { floorFade } from '../apps/web/src/scene/floorFade';
import { Box } from '../apps/web/src/scene/Models';
import { StadiumPitch } from '../apps/web/src/scene/StadiumPitch';

function elements(node: ReactNode): ReactElement<any>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child)
      ? [child, ...elements(child.props.children)]
      : [],
  );
}

it('keeps thin furniture bevels inside the geometry and structural boxes cheap', () => {
  const arm = Box({ size: [0.15, 0.09, 0.71], color: '#47414b', radius: 0.05 });
  expect(arm.props.radius).toBeCloseTo(0.03);
  expect(arm.props.bevelSegments).toBe(1);
  const structural = Box({ size: [0.045, 0.45, 0.045], color: '#715440' });
  expect(elements(structural).some((element) => element.type === 'boxGeometry')).toBe(true);
});

it('keeps editable pitch dimensions and contrasts stripes while protecting markings from z-fighting', () => {
  const color = '#487b52';
  const pitch = StadiumPitch({ width: 76, depth: 48, height: 4, color });
  expect(pitch.props.scale).toEqual([2, 2, 2]);
  const tree = elements(pitch);
  const turf = tree.filter(
    (element) => element.type === 'meshStandardMaterial' && element.props.roughness === 1,
  );
  expect(turf).toHaveLength(7);
  expect(turf[0].props.color).toBe(color);
  for (const stripe of turf.slice(1)) {
    expect(stripe.props.color.r).toBeLessThan(new Color(color).r);
    expect(stripe.props.color.g).toBeGreaterThan(stripe.props.color.r);
  }
  const lines = tree.filter((element) => element.type === 'meshBasicMaterial');
  expect(lines).toHaveLength(12);
  for (const line of lines) {
    expect(line.props.polygonOffset).toBe(true);
    expect(line.props.polygonOffsetFactor).toBeLessThan(0);
  }
});

it('fades the floor in shared world coordinates without replacing standard lighting or shadows', () => {
  for (const [width, depth] of [
    [12, 8],
    [80, 60],
  ]) {
    const shader = { ...ShaderLib.standard, uniforms: {} } as Parameters<
      MeshStandardMaterial['onBeforeCompile']
    >[0];
    floorFade(width, depth)(shader, undefined as never);
    expect(shader.uniforms.floorHalfSize.value.toArray()).toEqual([width / 2, depth / 2]);
    expect(shader.vertexShader).toContain('(modelMatrix * vec4(position, 1.0)).xz');
    expect(shader.fragmentShader).toContain(
      'smoothstep(0.0, 0.65, min(edgeDistance.x, edgeDistance.y))',
    );
    expect(shader.fragmentShader).toContain('#include <lights_fragment_begin>');
    expect(shader.fragmentShader).toContain('#include <shadowmap_pars_fragment>');
    expect(shader.fragmentShader).toContain('#include <alphamap_fragment>');
  }
});
