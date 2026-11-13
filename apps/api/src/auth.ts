import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import type { RequestHandler } from 'express';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function authentication(pool: Pool, password: string) {
  const salt = randomBytes(16),
    expected = scryptSync(password, salt, 32);
  const matches = (value: string) => timingSafeEqual(expected, scryptSync(value, salt, 32));
  const guard: RequestHandler = async (req, res, next) => {
    const token = req.cookies?.ov_session;
    if (typeof token !== 'string' || token.length !== 64) {
      res.status(401).json({ message: 'Sign in to manage this venue' });
      return;
    }
    const result = await pool.query(
      'SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at>now()',
      [tokenHash(token)],
    );
    if (!result.rowCount) {
      res.status(401).json({ message: 'Session expired. Please sign in again.' });
      return;
    }
    next();
  };
  return { matches, guard };
}
