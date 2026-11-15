import { useEffect, useState } from 'react';
import {
  eventPricingSchema,
  formatPrice,
  type EventPricing,
  type Layout,
} from '@openvenue/contracts';
import { api, json } from './api';

export function EventPricingCard({
  venueId,
  showId,
  layout,
  run,
  working,
  onChanged,
}: {
  venueId: string;
  showId: string;
  layout: Layout;
  run: (work: () => Promise<void>) => Promise<void>;
  working: boolean;
  onChanged: (message: string) => void;
}) {
  const [multiplier, setMultiplier] = useState('1');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const path = `/venues/${venueId}/shows/${showId}/pricing`;
  const tiers = layout.pricing.mode === 'tiers' ? (layout.pricing.tiers ?? []) : [];
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    api<EventPricing>(path, { signal: controller.signal })
      .then((pricing) => {
        setMultiplier(String(pricing.multiplier));
        setOverrides(
          Object.fromEntries(
            pricing.overrides.map((override) => [override.tierId, String(override.amount / 100)]),
          ),
        );
        setLoaded(true);
        setError('');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setError(error.message);
      });
    return () => controller.abort();
  }, [path]);
  return (
    <section
      className="mt-4 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200"
      aria-label="Pricing for this event"
    >
      <h3>Pricing for this event</h3>
      <p className="muted mt-2 text-xs">
        Overrides replace tier prices; otherwise the multiplier applies to venue prices. Existing
        reservations keep their saved prices.
      </p>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {!loaded ? (
        <p className="muted text-xs">Loading event prices…</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const pricing = eventPricingSchema.parse({
                multiplier: Number(multiplier),
                overrides: tiers
                  .filter((tier) => overrides[tier.id] !== undefined && overrides[tier.id] !== '')
                  .map((tier) => ({
                    tierId: tier.id,
                    amount: Math.round(Number(overrides[tier.id]) * 100),
                  })),
              });
              await api(path, json(pricing, 'PUT'));
              onChanged('Event prices saved. Existing reservation prices were kept.');
            });
          }}
        >
          <label>
            Event price multiplier
            <input
              required
              type="number"
              min="0"
              max="99.99"
              step="0.01"
              value={multiplier}
              onChange={(event) => setMultiplier(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {[10, 25, 50].map((percent) => (
              <button
                type="button"
                key={percent}
                className="secondary"
                onClick={() => setMultiplier(String(1 + percent / 100))}
              >
                +{percent}%
              </button>
            ))}
          </div>
          <p className="muted mt-2 text-xs">
            Use 1 for standard prices or enter a custom multiplier, such as 1.30 for +30%. Blank
            overrides use the multiplier; 0 is free.
          </p>
          {tiers.map((tier) => (
            <label key={tier.id}>
              <span className="flex min-w-0 items-center gap-2">
                <i className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: tier.color }} />
                <span className="break-all">
                  {tier.name} · base {formatPrice(tier.amount, layout.pricing.currency)}
                </span>
              </span>
              <input
                aria-label={`Override ${tier.name} price`}
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                placeholder="Use multiplier"
                value={overrides[tier.id] ?? ''}
                onChange={(event) => setOverrides({ ...overrides, [tier.id]: event.target.value })}
              />
            </label>
          ))}
          <button className="secondary full mt-3" disabled={working}>
            Save event prices
          </button>
        </form>
      )}
    </section>
  );
}
