// Run the real API runtime; Playwright's transformer does not support Nest parameter decorators.
import { createApp } from '../../apps/api/src/app.ts';

const app = await createApp({
  databaseUrl: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
  adminPassword: 'integration-password-123',
  secureCookies: false,
});
await app.listen(0, '127.0.0.1');
process.send({ url: await app.getUrl() });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
}
process.on('message', (message) => {
  if (message === 'close') void close();
});
process.once('disconnect', close);
process.once('SIGTERM', close);
process.once('SIGINT', close);
