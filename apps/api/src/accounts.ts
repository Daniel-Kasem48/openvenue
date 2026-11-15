import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Router, RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { createAccountSchema, updateAccountSchema } from '@openvenue/contracts';
import { hashPassword, tokenHash, type Principal } from './auth';
import { transaction } from './database';

const columns = 'id,email,name,role,created_at AS "createdAt",disabled_at AS "disabledAt"';
const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
export async function audit(
  client: PoolClient,
  principal: Principal,
  action: string,
  entity: string,
  id: string,
) {
  await client.query(
    'INSERT INTO audit_log(id,user_id,action,entity,entity_id) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), principal.userId, action, entity, id],
  );
}
async function lockOwner(client: PoolClient, principal: Principal) {
  // Serialize bootstrap and owner changes so two owners cannot remove the last owner.
  await client.query('SELECT pg_advisory_xact_lock(745922)');
  if (!principal.userId) {
    if ((await client.query('SELECT 1 FROM users LIMIT 1')).rowCount)
      fail(401, 'Sign in with your account.');
  } else if (
    !(
      await client.query(
        "SELECT 1 FROM users WHERE id=$1 AND role='owner' AND disabled_at IS NULL",
        [principal.userId],
      )
    ).rowCount
  )
    fail(403, 'Only an active owner can manage accounts.');
}
export function registerAccounts(router: Router, pool: Pool, ownerGuard: RequestHandler) {
  router.get('/users', ownerGuard, async (_req, res) =>
    res.json((await pool.query(`SELECT ${columns} FROM users ORDER BY created_at,id`)).rows),
  );
  router.post('/users', ownerGuard, async (req, res) => {
    const body = createAccountSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    const user = await transaction(pool, async (client) => {
      const principal = res.locals.principal as Principal;
      await lockOwner(client, principal);
      if (!principal.userId && body.role !== 'owner')
        fail(400, 'The first account must be an owner.');
      const row = (
        await client.query(
          `INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING RETURNING ${columns}`,
          [randomUUID(), body.email, body.name, passwordHash, body.role],
        )
      ).rows[0];
      if (!row) fail(409, 'An account with that email already exists.');
      if (!principal.userId)
        await client.query('UPDATE sessions SET user_id=$1 WHERE token_hash=$2', [
          row.id,
          tokenHash(req.cookies.ov_session),
        ]);
      return row;
    });
    res.status(201).json(user);
  });
  router.patch('/users/:id', ownerGuard, async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = updateAccountSchema.parse(req.body);
    const user = await transaction(pool, async (client) => {
      await lockOwner(client, res.locals.principal);
      const old = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!old) fail(404, 'Account not found');
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
        !(
          await client.query(
            "SELECT 1 FROM users WHERE role='owner' AND disabled_at IS NULL AND id<>$1",
            [old.id],
          )
        ).rowCount
      )
        fail(409, 'Keep at least one active owner.');
      return (
        await client.query(
          `UPDATE users SET role=$2,disabled_at=$3 WHERE id=$1 RETURNING ${columns}`,
          [old.id, role, disabledAt],
        )
      ).rows[0];
    });
    res.json(user);
  });
}
