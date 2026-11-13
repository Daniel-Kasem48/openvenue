import 'dotenv/config';
import { createApp } from './app';
const { DATABASE_URL, ADMIN_PASSWORD, NODE_ENV, PORT } = process.env;
if (!DATABASE_URL || !ADMIN_PASSWORD) throw new Error('Set DATABASE_URL and ADMIN_PASSWORD (see .env.example)');
const app = await createApp({databaseUrl:DATABASE_URL,adminPassword:ADMIN_PASSWORD,secureCookies:NODE_ENV==='production'});
await app.listen(Number(PORT??3001),'0.0.0.0');
console.log(`OpenVenue API listening on http://127.0.0.1:${PORT??3001}`);
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await app.close(); process.exit(0);});
