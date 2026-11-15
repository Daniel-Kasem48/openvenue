import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { fail } from '../common/errors';
import { APP_CONFIG, type AppConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { hashPassword, tokenHash, verifyPassword, type Principal } from './credentials';
@Injectable()
export class AuthService {
  private readonly legacyHash: Promise<string>;
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.legacyHash = hashPassword(config.adminPassword);
  }
  async verifyLogin(email: string | undefined, value: string): Promise<Principal | null> {
    if (!(await this.db.pool.query('SELECT 1 FROM users LIMIT 1')).rowCount)
      return (await verifyPassword(value, await this.legacyHash))
        ? { userId: null, name: 'Administrator', role: 'owner' }
        : null;
    const user = (
      await this.db.pool.query(
        'SELECT id,name,role,password_hash,disabled_at FROM users WHERE email=$1',
        [email ?? ''],
      )
    ).rows[0];
    const matches = await verifyPassword(value, user?.password_hash ?? (await this.legacyHash));
    return user && !user.disabled_at && matches
      ? { userId: user.id, name: user.name, role: user.role }
      : null;
  }
  async login(email: string | undefined, password: string) {
    const principal = await this.verifyLogin(email, password);
    if (!principal) return fail(401, 'Invalid email or password');
    const token = randomBytes(32).toString('hex');
    await this.db.pool.query('DELETE FROM sessions WHERE expires_at<=now()');
    await this.db.pool.query(
      "INSERT INTO sessions(token_hash,expires_at,user_id) VALUES($1,now()+interval '8 hours',$2)",
      [tokenHash(token), principal.userId],
    );
    return token;
  }
  async authenticate(token: unknown): Promise<Principal> {
    if (typeof token !== 'string' || token.length !== 64)
      return fail(401, 'Sign in to manage this venue');
    const session = (
      await this.db.pool.query(
        `SELECT s.user_id,u.name,u.role FROM sessions s LEFT JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND
      ((s.user_id IS NOT NULL AND u.disabled_at IS NULL) OR (s.user_id IS NULL AND NOT EXISTS(SELECT 1 FROM users)))`,
        [tokenHash(token)],
      )
    ).rows[0];
    if (!session) return fail(401, 'Session expired. Please sign in again.');
    return {
      userId: session.user_id,
      name: session.name ?? 'Administrator',
      role: session.role ?? 'owner',
    };
  }
  async logout(token: unknown) {
    if (typeof token === 'string')
      await this.db.pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
  }
}
