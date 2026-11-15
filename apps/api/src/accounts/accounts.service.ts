import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { createAccountSchema, updateAccountSchema } from '@openvenue/contracts';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../auth/credentials';
import { hashPassword, tokenHash } from '../auth/credentials';
import { fail } from '../common/errors';
import { DatabaseService } from '../database/database.service';
import { Session, User } from '../database/entities';

function account(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.created_at,
    disabledAt: user.disabled_at,
  };
}

async function lockOwner(em: EntityManager, principal: Principal) {
  // Serialize bootstrap and owner changes so two owners cannot remove the last owner.
  await em.execute('SELECT pg_advisory_xact_lock(745922)');
  const users = em.getRepository(User);
  if (!principal.userId) {
    if (await users.count()) fail(401, 'Sign in with your account.');
  } else if (!(await users.count({ id: principal.userId, role: 'owner', disabled_at: null }))) {
    fail(403, 'Only an active owner can manage accounts.');
  }
}

@Injectable()
export class AccountsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async list() {
    const em = this.db.em;
    return (
      await em.getRepository(User).find({}, { orderBy: { created_at: 'asc', id: 'asc' } })
    ).map(account);
  }
  async create(input: unknown, principal: Principal, sessionToken: string) {
    const body = createAccountSchema.parse(input);
    const passwordHash = await hashPassword(body.password);
    const em = this.db.em;
    return em.transactional(async (em) => {
      await lockOwner(em, principal);
      const users = em.getRepository(User);
      if (!principal.userId && body.role !== 'owner')
        fail(400, 'The first account must be an owner.');
      if (await users.count({ email: body.email }))
        fail(409, 'An account with that email already exists.');
      const user = users.create({
        id: randomUUID(),
        email: body.email,
        name: body.name,
        password_hash: passwordHash,
        role: body.role,
        disabled_at: null,
      });
      await em.flush();
      if (!principal.userId)
        await em
          .getRepository(Session)
          .nativeUpdate({ token_hash: tokenHash(sessionToken) }, { user_id: user.id });
      return account(user);
    });
  }
  async update(id: string, input: unknown, principal: Principal) {
    const body = updateAccountSchema.parse(input);
    const em = this.db.em;
    return em.transactional(async (em) => {
      await lockOwner(em, principal);
      const users = em.getRepository(User);
      const old = await users.findOne({ id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!old) return fail(404, 'Account not found');
      const role = body.role ?? old.role,
        disabledAt =
          body.disabled === undefined
            ? old.disabled_at
            : body.disabled
              ? (old.disabled_at ?? new Date())
              : null;
      if (
        old.role === 'owner' &&
        !old.disabled_at &&
        (role !== 'owner' || disabledAt) &&
        !(await users.count({ role: 'owner', disabled_at: null, id: { $ne: old.id } }))
      )
        fail(409, 'Keep at least one active owner.');
      old.role = role;
      old.disabled_at = disabledAt;
      await em.flush();
      return account(old);
    });
  }
}
