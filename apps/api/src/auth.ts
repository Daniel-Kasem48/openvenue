import { promisify } from 'node:util';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import type { RequestHandler } from 'express';
import type { Role } from '@openvenue/contracts';

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
export async function authentication(pool: Pool, password: string) {
  const legacyHash = await hashPassword(password);
  const verifyLogin = async (
    email: string | undefined,
    value: string,
  ): Promise<Principal | null> => {
    if (!(await pool.query('SELECT 1 FROM users LIMIT 1')).rowCount)
      return (await verifyPassword(value, legacyHash))
        ? { userId: null, name: 'Administrator', role: 'owner' }
        : null;
    const user = (
      await pool.query('SELECT id,name,role,password_hash,disabled_at FROM users WHERE email=$1', [
        email ?? '',
      ])
    ).rows[0];
    const matches = await verifyPassword(value, user?.password_hash ?? legacyHash);
    return user && !user.disabled_at && matches
      ? { userId: user.id, name: user.name, role: user.role }
      : null;
  };
  const authorize =
    (...roles: Role[]): RequestHandler =>
    async (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      const token = req.cookies?.ov_session;
      if (typeof token !== 'string' || token.length !== 64) {
        res.status(401).json({ message: 'Sign in to manage this venue' });
        return;
      }
      const session = (
        await pool.query(
          `SELECT s.user_id,u.name,u.role FROM sessions s LEFT JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND
      ((s.user_id IS NOT NULL AND u.disabled_at IS NULL) OR (s.user_id IS NULL AND NOT EXISTS(SELECT 1 FROM users)))`,
          [tokenHash(token)],
        )
      ).rows[0];
      if (!session) {
        res.status(401).json({ message: 'Session expired. Please sign in again.' });
        return;
      }
      const principal: Principal = {
        userId: session.user_id,
        name: session.name ?? 'Administrator',
        role: session.role ?? 'owner',
      };
      if (!roles.includes(principal.role)) {
        res.status(403).json({ message: 'Your account does not have permission for this action.' });
        return;
      }
      res.locals.principal = principal;
      next();
    };
  return {
    verifyLogin,
    guard: authorize('owner', 'manager'),
    readGuard: authorize('owner', 'manager', 'staff'),
    ownerGuard: authorize('owner'),
  };
}
