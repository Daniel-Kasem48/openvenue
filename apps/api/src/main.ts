import 'dotenv/config';
import { createApp } from './app';
const { DATABASE_URL, ADMIN_PASSWORD, NODE_ENV, PORT, PUBLIC_ORIGIN } = process.env;
if (!DATABASE_URL || !ADMIN_PASSWORD)
  throw new Error('Set DATABASE_URL and ADMIN_PASSWORD (see .env.example)');
if (NODE_ENV === 'production' && !PUBLIC_ORIGIN)
  throw new Error('Set PUBLIC_ORIGIN for production');
if (PUBLIC_ORIGIN) {
  const url = new URL(PUBLIC_ORIGIN);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== PUBLIC_ORIGIN)
    throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a trailing slash');
  if (
    NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error('Use HTTPS for public deployments');
}
const app = await createApp({
  databaseUrl: DATABASE_URL,
  adminPassword: ADMIN_PASSWORD,
  secureCookies: PUBLIC_ORIGIN?.startsWith('https://') ?? false,
  publicOrigin: NODE_ENV === 'production' ? PUBLIC_ORIGIN : undefined,
});
await app.listen(Number(PORT ?? 3188), '0.0.0.0');
console.log(`OpenVenue API listening on http://127.0.0.1:${PORT ?? 3188}`);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
