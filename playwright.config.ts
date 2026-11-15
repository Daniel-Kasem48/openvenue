import 'dotenv/config';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { headless: true },
  globalSetup: './tests/browser/setup.ts',
});
