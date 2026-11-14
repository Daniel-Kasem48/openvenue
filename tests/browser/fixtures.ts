import { test as base, expect } from '@playwright/test';
import { createApp } from '../../apps/api/src/app';

export { expect };
export const test = base.extend({
  baseURL: async ({}, use) => {
    // Each test gets fresh in-memory rate limits; existing database rows are preserved.
    const app = await createApp({
      databaseUrl: (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL)!,
      adminPassword: 'integration-password-123',
      secureCookies: false,
    });
    try {
      await app.listen(0, '127.0.0.1');
      await use(await app.getUrl());
    } finally {
      await app.close();
    }
  },
});
