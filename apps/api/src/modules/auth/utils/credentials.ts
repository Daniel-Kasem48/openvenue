import type { Role } from '@openvenue/contracts';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await derive(password, salt, 32)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(stored)) return false;
  const [salt, hash] = stored.split(':');
  return timingSafeEqual((await derive(password, salt, 32)) as Buffer, Buffer.from(hash, 'hex'));
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export type Principal = { userId: string | null; name: string; role: Role };
