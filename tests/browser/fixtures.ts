import { test as base, expect } from '@playwright/test';
import { fork } from 'node:child_process';
import { once } from 'node:events';

export { expect };
export const test = base.extend({
  baseURL: async ({}, use) => {
    // Each test gets a fresh process and rate limits; existing database rows are preserved.
    const server = fork(new URL('./server.mjs', import.meta.url), {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test API startup timed out')), 15000);
        server.once('message', (message: { url: string }) => {
          clearTimeout(timeout);
          resolve(message.url);
        });
        server.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        server.once('exit', (code) => {
          clearTimeout(timeout);
          reject(new Error(`Test API exited before startup (${code})`));
        });
      });
      await use(url);
    } finally {
      if (server.pid && server.exitCode === null && server.signalCode === null) {
        const exited = once(server, 'exit');
        const timeout = setTimeout(() => server.kill('SIGKILL'), 10000);
        if (server.connected) server.send('close');
        else server.kill('SIGTERM');
        await exited;
        clearTimeout(timeout);
      }
    }
  },
});
