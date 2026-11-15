import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { fail } from '../../../common/errors';
import { APP_CONFIG, type AppConfig } from '../../../config';
import { DatabaseService } from '../../database/database.service';
import { Session } from '../entities/session.entity';
import { User } from '../../accounts/entities/user.entity';
import { hashPassword, tokenHash, verifyPassword, type Principal } from '../utils/credentials';
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
    const em = this.db.em;
    const users = em.getRepository(User);
    if (!(await users.count()))
      return (await verifyPassword(value, await this.legacyHash))
        ? { userId: null, name: 'Administrator', role: 'owner' }
        : null;
    const user = await users.findOne({ email: email ?? '' });
    const matches = await verifyPassword(value, user?.password_hash ?? (await this.legacyHash));
    return user && !user.disabled_at && matches
      ? { userId: user.id, name: user.name, role: user.role }
      : null;
  }
  async login(email: string | undefined, password: string) {
    const principal = await this.verifyLogin(email, password);
    if (!principal) return fail(401, 'Invalid email or password');
    const token = randomBytes(32).toString('hex');
    const em = this.db.em;
    const [{ now: databaseTime }] = await em.execute<{ now: string }[]>('SELECT now()');
    const now = new Date(databaseTime);
    const sessions = em.getRepository(Session);
    await sessions.nativeDelete({ expires_at: { $lte: now } });
    sessions.create({
      token_hash: tokenHash(token),
      expires_at: new Date(now.getTime() + 8 * 60 * 60 * 1000),
      user_id: principal.userId,
    });
    await em.flush();
    return token;
  }
  async authenticate(token: unknown): Promise<Principal> {
    if (typeof token !== 'string' || token.length !== 64)
      return fail(401, 'Sign in to manage this venue');
    const em = this.db.em;
    const [{ now: databaseTime }] = await em.execute<{ now: string }[]>('SELECT now()');
    const now = new Date(databaseTime);
    const users = em.getRepository(User);
    const session = await em.getRepository(Session).findOne({
      token_hash: tokenHash(token),
      expires_at: { $gt: now },
    });
    if (session) {
      if (session.user_id) {
        const user = await users.findOne({ id: session.user_id, disabled_at: null });
        if (user) return { userId: user.id, name: user.name, role: user.role };
      } else if (!(await users.count())) {
        return { userId: null, name: 'Administrator', role: 'owner' };
      }
    }
    return fail(401, 'Session expired. Please sign in again.');
  }
  async logout(token: unknown) {
    if (typeof token === 'string')
      await this.db.em.getRepository(Session).nativeDelete({ token_hash: tokenHash(token) });
  }
}
