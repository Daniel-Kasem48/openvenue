import { mkdir } from 'node:fs/promises';
import { expect, test } from './fixtures';

for (const kind of ['restaurant', 'parking', 'cinema', 'stadium'] as const) {
  test(`${kind} scene renders and camera changes the image`, async ({ page, request }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      const locations = new WeakMap<WebGLUniformLocation, string>();
      const proto = WebGL2RenderingContext.prototype;
      const get = proto.getUniformLocation;
      const set = proto.uniformMatrix4fv;
      proto.getUniformLocation = function (program, name) {
        const location = get.call(this, program, name);
        if (location) locations.set(location, name);
        return location;
      };
      proto.uniformMatrix4fv = function (location, transpose, data, ...rest) {
        if (location && locations.get(location) === 'viewMatrix')
          (window as any).__cameraView = Array.from(data as Iterable<number>);
        return (set as any).call(this, location, transpose, data, ...rest);
      };
    });
    await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
    const name = `Scene ${kind} ${Date.now()}`;
    const response = await request.post('/api/venues', { data: { name, kind } });
    expect(response.ok()).toBe(true);
    await page.goto('/');
    await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
    await page.getByLabel('Password').fill('integration-password-123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page
      .locator('.venue-list')
      .getByRole('button', { name: new RegExp(name) })
      .click();
    await page.getByRole('button', { name: '3D view', exact: true }).click();
    const canvas = page.locator('canvas');
    await canvas.scrollIntoViewIfNeeded();
    await expect
      .poll(() => page.evaluate(() => (window as any).__cameraView?.length), { timeout: 30000 })
      .toBe(16);
    await page.waitForTimeout(1500);
    const initial = await canvas.screenshot();
    if (process.env.SCENE_EVIDENCE) {
      await mkdir('docs/tasks/evidence', { recursive: true });
      await page
        .locator('.map-stage')
        .screenshot({ path: `docs/tasks/evidence/05-${kind}-${process.env.SCENE_EVIDENCE}.png` });
      console.log(
        kind,
        await canvas.evaluate((el) => {
          const gl = (el as HTMLCanvasElement).getContext('webgl2')!;
          const debug = gl.getExtension('WEBGL_debug_renderer_info');
          return debug
            ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER);
        }),
      );
    }
    const pose = await page.evaluate(() => (window as any).__cameraView);
    await page.getByRole('button', { name: 'Top camera view', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__cameraView)).not.toEqual(pose);
    await expect.poll(async () => !(await canvas.screenshot()).equals(initial)).toBe(true);
  });
}
