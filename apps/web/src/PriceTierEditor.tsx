import { formatPrice, reservationPrice, type Layout } from '@openvenue/contracts';
import { removeTier, type SelectionScope } from './priceTiers';

export function PriceTierEditor({
  layout,
  onChange,
  paintTier,
  onPaintTier,
  scope,
  onScope,
}: {
  layout: Layout;
  onChange: (layout: Layout) => void;
  paintTier: string | null;
  onPaintTier: (id: string | null) => void;
  scope: SelectionScope;
  onScope: (scope: SelectionScope) => void;
}) {
  const tiers = layout.pricing.tiers ?? [];
  const resources = layout.floors.flatMap((floor) => floor.resources);
  const assigned = resources.filter((resource) => resource.tierId).length;
  const total = resources.reduce((sum, resource) => sum + reservationPrice(layout, resource), 0);
  const update = (id: string, patch: Partial<(typeof tiers)[number]>) =>
    onChange({
      ...layout,
      pricing: {
        ...layout.pricing,
        tiers: tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)),
      },
    });
  return (
    <div className="mt-3 space-y-3">
      {tiers.map((tier, index) => {
        const count = resources.filter((resource) => resource.tierId === tier.id).length;
        return (
          <fieldset key={tier.id} className="rounded-lg border border-stone-200 p-3">
            <legend className="px-1 text-xs font-semibold">Tier {index + 1}</legend>
            <label>
              Name
              <input
                aria-label={`Tier ${index + 1} name`}
                value={tier.name}
                maxLength={100}
                onChange={(event) => update(tier.id, { name: event.target.value })}
              />
            </label>
            <div className="grid grid-cols-[56px_1fr] gap-3">
              <label>
                Colour
                <input
                  aria-label={`Tier ${index + 1} colour`}
                  type="color"
                  value={tier.color}
                  onChange={(event) => update(tier.id, { color: event.target.value })}
                />
              </label>
              <label>
                Amount ({layout.pricing.currency})
                <input
                  aria-label={`Tier ${index + 1} amount`}
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  value={tier.amount / 100}
                  onChange={(event) =>
                    update(tier.id, { amount: Math.round(Number(event.target.value) * 100) })
                  }
                />
              </label>
            </div>
            <p className="text-xs text-stone-600">
              {count} places · {formatPrice(count * tier.amount, layout.pricing.currency)} potential
              revenue
            </p>
            <button
              className="text-button danger"
              aria-label={`Delete ${tier.name} tier`}
              onClick={() => {
                onChange(removeTier(layout, tier.id));
                if (paintTier === tier.id) onPaintTier(null);
              }}
            >
              Delete tier
            </button>
          </fieldset>
        );
      })}
      <button
        className="secondary full"
        disabled={tiers.length >= 12}
        onClick={() => {
          const tier = {
            id: crypto.randomUUID(),
            name: `Tier ${tiers.length + 1}`,
            color: '#77988a',
            amount: layout.pricing.amount,
          };
          onChange({ ...layout, pricing: { ...layout.pricing, tiers: [...tiers, tier] } });
        }}
      >
        Add price tier
      </button>
      <label className="check">
        <input
          type="checkbox"
          checked={paintTier !== null}
          onChange={(event) => onPaintTier(event.target.checked ? (tiers[0]?.id ?? '') : null)}
        />
        Paint prices
      </label>
      {paintTier !== null && (
        <>
          <label>
            Paint tier
            <select value={paintTier} onChange={(event) => onPaintTier(event.target.value)}>
              <option value="">Unassigned (use fallback price)</option>
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Paint scope
            <select
              value={scope}
              onChange={(event) => onScope(event.target.value as SelectionScope)}
            >
              <option value="seat">Seat / place</option>
              <option value="row">Row</option>
              <option value="block">Block</option>
            </select>
          </label>
          <p className="muted text-xs">
            Click places in either map to assign prices. Painting does not move or book them. Save
            layout to apply.
          </p>
        </>
      )}
      <p className="rounded-lg bg-stone-50 p-3 text-xs" data-testid="pricing-totals">
        {assigned} assigned · {resources.length - assigned} unassigned
        <br />
        {formatPrice(total, layout.pricing.currency)} potential revenue at full sale
      </p>
    </div>
  );
}
