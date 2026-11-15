import { useEffect, useState } from 'react';
import type { Account, Role } from '@openvenue/contracts';
import { api, json } from './api';

export function Team({
  bootstrap,
  onChange,
}: {
  bootstrap: boolean;
  onChange: () => Promise<void>;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Account[]>('/users')
      .then(setAccounts)
      .catch((e) => setError(e.message));
  }, []);
  const change = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await onChange();
      setAccounts(await api<Account[]>('/users'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel space-y-5 p-5">
      <h2>Team</h2>
      <p>
        {bootstrap
          ? 'Create the first owner to replace the shared setup password.'
          : 'Create accounts and share their initial passwords privately.'}
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void change(async () => {
            await api('/users', json({ name, email, password, role: bootstrap ? 'owner' : role }));
            setName('');
            setEmail('');
            setPassword('');
          });
        }}
      >
        <label>
          Account name
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Account email
          <input
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Initial password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {!bootstrap && (
          <label>
            Account role
            <select
              aria-label="Account role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {['staff', 'manager', 'owner'].map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </label>
        )}
        <button className="primary" disabled={busy}>
          {bootstrap ? 'Create owner' : 'Create account'}
        </button>
      </form>
      <ul className="space-y-3">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-3"
          >
            <div className="min-w-0 flex-1 break-words">
              <strong>{account.name}</strong>
              <small>{account.email}</small>
              {account.disabledAt && <small>Disabled</small>}
            </div>
            <select
              aria-label={`Role for ${account.name}`}
              value={account.role}
              disabled={busy}
              onChange={(e) =>
                void change(() =>
                  api(`/users/${account.id}`, json({ role: e.target.value }, 'PATCH')),
                )
              }
            >
              {['staff', 'manager', 'owner'].map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void change(() =>
                  api(`/users/${account.id}`, json({ disabled: !account.disabledAt }, 'PATCH')),
                )
              }
            >
              {account.disabledAt ? 'Enable' : 'Disable'} {account.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
