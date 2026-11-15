import { Download, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  currencySchema,
  seatIdentity,
  seatSection,
  makeObject,
  objectKinds,
  type SceneObject,
  type Venue,
  type Floor,
  type Resource,
  type Layout,
} from '@openvenue/contracts';
type Props = {
  view: '2d' | '3d';
  draft: Venue;
  floor: Floor;
  floorIndex: number;
  resource?: Resource;
  selected: string;
  updateLayout: (layout: Layout) => void;
  setFloorIndex: (value: number) => void;
  setSelected: (id: string) => void;
  updateResource: (patch: Partial<Resource>) => void;
  addResource: () => void;
  exportLayout: () => void;
  importLayout: (file?: File) => Promise<void>;
};
export function LayoutInspector({
  view,
  draft,
  floor,
  floorIndex,
  resource,
  selected,
  updateLayout,
  setFloorIndex,
  setSelected,
  updateResource,
  addResource,
  exportLayout,
  importLayout,
}: Props) {
  const [search, setSearch] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.closest('aside')?.scrollTo({ top: 0 });
  }, [selected]);
  const items = [...floor.resources, ...floor.objects];
  const matches = items.filter((item) =>
    `${item.label} ${item.kind}`.toLowerCase().includes(search.toLowerCase()),
  );
  const object = (floor.objects ?? []).find((o) => o.id === selected);
  const updateObjects = (objects: SceneObject[]) =>
    updateLayout({
      ...draft.layout,
      floors: draft.layout.floors.map((f, i) => (i === floorIndex ? { ...f, objects } : f)),
    });
  const patchObject = (patch: Partial<SceneObject>) =>
    updateLayout({
      ...draft.layout,
      floors: draft.layout.floors.map((f, i) =>
        i !== floorIndex
          ? f
          : {
              ...f,
              objects: f.objects.map((o) => (o.id === selected ? { ...o, ...patch } : o)),
              resources:
                object?.kind === 'label' && patch.label !== undefined
                  ? f.resources.map((r) =>
                      r.section === object.label ? { ...r, section: patch.label! } : r,
                    )
                  : f.resources,
            },
      ),
    });
  const pricing = draft.layout.pricing;
  const setPricing = (patch: Partial<Layout['pricing']>) =>
    updateLayout({ ...draft.layout, pricing: { ...pricing, ...patch } });
  const grid = 'grid grid-cols-2 gap-x-3 [&_label]:capitalize';
  return (
    <>
      <div className="eyebrow">LAYOUT STUDIO</div>
      <h3>Edit your space</h3>
      <p className="muted">
        {view === '2d'
          ? 'Drag items to move them. Drag empty space to pan.'
          : 'Select an item, then drag its arrows to move it. Changes apply when you save.'}
      </p>
      <details className="section object-library">
        <summary>
          <span className="mr-auto">
            Find an item ·{' '}
            <span className="font-normal text-stone-400">{items.length} on this floor</span>
          </span>
        </summary>
        <label>
          Search items
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or type…"
          />
        </label>
        <label>
          Scene item
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Select an item</option>
            {items
              .filter(
                (item) =>
                  item.id === selected ||
                  `${item.label} ${item.kind}`.toLowerCase().includes(search.toLowerCase()),
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} · {item.kind}
                </option>
              ))}
          </select>
        </label>
        {matches.length === 0 && <p className="muted">No matching items.</p>}
      </details>
      <div
        className={`my-2 rounded-xl p-4 ring-1 ${object || resource ? 'bg-white shadow-card ring-stone-200' : 'bg-stone-50 ring-stone-100'}`}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-medium tracking-wide text-stone-400 uppercase">
              {object ? object.kind : resource ? resource.kind : 'Selection'}
            </div>
            <h4 ref={heading} className="mt-0.5 wrap-anywhere">
              {object?.label ?? resource?.label ?? 'Nothing selected'}
            </h4>
          </div>
          {object && (
            <button
              className="text-button danger -mr-2 shrink-0"
              onClick={() => {
                updateObjects((floor.objects ?? []).filter((o) => o.id !== selected));
                setSelected('');
              }}
            >
              Remove object
            </button>
          )}
          {resource && (
            <button
              className="text-button danger -mr-2 shrink-0"
              onClick={() => {
                updateLayout({
                  ...draft!.layout,
                  floors: draft!.layout.floors.map((f, i) =>
                    i === floorIndex
                      ? {
                          ...f,
                          resources: f.resources.filter((r) => r.id !== selected),
                        }
                      : f,
                  ),
                });
                setSelected('');
              }}
            >
              Remove resource
            </button>
          )}
        </div>
        {!object && !resource && (
          <p className="text-[13px] leading-relaxed text-stone-500">
            Click an item on the map, find it by name, or add one below.
          </p>
        )}
        {object && (
          <div className="resource-editor">
            <label>
              Object label
              <input
                value={object.label}
                maxLength={object.kind === 'label' ? 40 : 100}
                onChange={(e) => patchObject({ label: e.target.value })}
              />
            </label>
            <div className={grid}>
              {(['x', 'y', 'width', 'depth', 'height', 'rotation'] as const).map((key) => (
                <label key={key}>
                  {key}
                  <input
                    type="number"
                    step="0.1"
                    value={object[key]}
                    onChange={(e) => patchObject({ [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <label className="mb-0">
              Object color
              <input
                type="color"
                value={object.color}
                onChange={(e) => patchObject({ color: e.target.value })}
              />
            </label>
          </div>
        )}
        {resource && (
          <div className="resource-editor">
            {pricing.mode === 'per-resource' && (
              <div className="mb-4 rounded-lg bg-forest-50/70 p-3 ring-1 ring-forest-100">
                <label className="mb-0 text-forest-800">
                  Reservation price ({pricing.currency})
                  <span className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-stone-400">
                      {pricing.currency}
                    </span>
                    <input
                      aria-label="Reservation price"
                      className="pl-12 font-display text-base font-semibold tabular-nums"
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      value={resource.price / 100}
                      onChange={(e) =>
                        updateResource({ price: Math.round(Number(e.target.value) * 100) })
                      }
                    />
                  </span>
                </label>
                {resource.kind === 'seat' && seatIdentity(resource).row && (
                  <button
                    className="secondary full mt-2.5"
                    onClick={() =>
                      updateLayout({
                        ...draft.layout,
                        floors: draft.layout.floors.map((f, i) =>
                          i === floorIndex
                            ? {
                                ...f,
                                resources: f.resources.map((r) =>
                                  r.kind === 'seat' &&
                                  seatSection(r) === seatSection(resource) &&
                                  seatIdentity(r).row === seatIdentity(resource).row
                                    ? { ...r, price: resource.price }
                                    : r,
                                ),
                              }
                            : f,
                        ),
                      })
                    }
                  >
                    Apply price to this row
                  </button>
                )}
              </div>
            )}
            <label>
              Resource label
              <input
                value={resource.label}
                onChange={(e) => updateResource({ label: e.target.value })}
              />
            </label>
            {resource.kind === 'seat' && (
              <div className={grid}>
                <label>
                  Row label
                  <input
                    maxLength={12}
                    value={seatIdentity(resource).row}
                    onChange={(e) => updateResource({ row: e.target.value.toUpperCase() })}
                  />
                </label>
                <label>
                  Seat number
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={seatIdentity(resource).seatNumber ?? ''}
                    onChange={(e) =>
                      updateResource({
                        seatNumber: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </label>
              </div>
            )}
            {resource.kind === 'seat' && (
              <label>
                Section / block
                <input
                  value={resource.section}
                  maxLength={40}
                  onChange={(e) => updateResource({ section: e.target.value })}
                />
              </label>
            )}
            {resource.kind === 'seat' && (
              <label>
                Seat color
                <input
                  type="color"
                  value={resource.color}
                  onChange={(e) => updateResource({ color: e.target.value })}
                />
              </label>
            )}
            {resource.kind === 'table' && (
              <label>
                Table shape
                <select
                  value={resource.shape ?? 'rectangle'}
                  onChange={(e) => updateResource({ shape: e.target.value as Resource['shape'] })}
                >
                  <option value="rectangle">Rectangle</option>
                  <option value="round">Round / oval</option>
                </select>
              </label>
            )}
            <div className={grid}>
              {(['x', 'y', 'width', 'depth', 'rotation', 'capacity', 'elevation'] as const).map(
                (key) => (
                  <label key={key}>
                    {key}
                    <input
                      type="number"
                      step={key === 'capacity' ? 1 : 0.25}
                      value={resource[key]}
                      onChange={(e) => updateResource({ [key]: Number(e.target.value) })}
                    />
                  </label>
                ),
              )}
            </div>
            <label className="check mb-2">
              <input
                type="checkbox"
                checked={resource.accessible}
                onChange={(e) => updateResource({ accessible: e.target.checked })}
              />
              Accessible
            </label>
            {resource.kind === 'space' && (
              <label className="check mb-0">
                <input
                  type="checkbox"
                  checked={resource.ev}
                  onChange={(e) => updateResource({ ev: e.target.checked })}
                />
                EV charging
              </label>
            )}
          </div>
        )}
      </div>
      <details className="section object-library mt-4" open>
        <summary>
          Reservation pricing
          <span className="mr-auto ml-1 font-normal text-stone-400">
            ·{' '}
            {pricing.mode === 'free'
              ? 'Free'
              : pricing.mode === 'uniform'
                ? 'One price'
                : 'Per place'}
          </span>
        </summary>
        <label>
          Pricing mode
          <select
            value={pricing.mode}
            onChange={(e) => setPricing({ mode: e.target.value as Layout['pricing']['mode'] })}
          >
            <option value="free">Free reservations</option>
            <option value="uniform">Same price for every place</option>
            <option value="per-resource">Different price per seat / table / space</option>
          </select>
        </label>
        {pricing.mode !== 'free' && (
          <>
            <div className={pricing.mode === 'uniform' ? grid : ''}>
              <label>
                Currency
                <select
                  value={pricing.currency}
                  onChange={(e) =>
                    setPricing({ currency: e.target.value as Layout['pricing']['currency'] })
                  }
                >
                  {currencySchema.options.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              {pricing.mode === 'uniform' && (
                <label className="normal-case!">
                  Standard reservation price
                  <input
                    className="tabular-nums"
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.01"
                    value={pricing.amount / 100}
                    onChange={(e) =>
                      setPricing({ amount: Math.round(Number(e.target.value) * 100) })
                    }
                  />
                </label>
              )}
            </div>
            <p className="muted mb-0 text-xs">
              Per place, for the entire reservation. A table price covers the whole party. Payment
              is not collected here.
            </p>
            {pricing.mode === 'per-resource' && (
              <p className="mt-2 text-xs leading-relaxed text-forest-700">
                Select a seat, table or space on the map to set its price.
              </p>
            )}
          </>
        )}
      </details>
      <details className="section object-library" open>
        <summary>
          Object library
          <span className="mr-auto ml-1 font-normal text-stone-400">
            · {objectKinds.length} types
          </span>
        </summary>
        <div className="object-palette grid grid-cols-3 gap-1.5">
          {objectKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              className="truncate rounded-lg bg-stone-50 px-1 py-2 text-xs text-stone-700 capitalize ring-1 ring-stone-200/80 transition hover:bg-forest-50 hover:text-forest-800 hover:ring-forest-200"
              onClick={() => {
                const o = makeObject(kind, floor.width / 2, floor.depth / 2);
                o.width = Math.min(o.width, floor.width - 1);
                o.depth = Math.min(o.depth, floor.depth - 1);
                updateObjects([...(floor.objects ?? []), o]);
                setSelected(o.id);
              }}
            >
              + {kind}
            </button>
          ))}
        </div>
      </details>
      <details className="section object-library">
        <summary>Floor settings</summary>
        <label>
          Floor name
          <input
            value={floor.name}
            onChange={(e) =>
              updateLayout({
                ...draft!.layout,
                floors: draft!.layout.floors.map((f, i) =>
                  i === floorIndex ? { ...f, name: e.target.value } : f,
                ),
              })
            }
          />
        </label>
        <div className={grid}>
          {(['width', 'depth'] as const).map((key) => (
            <label key={key} className="normal-case!">
              Floor {key}
              <input
                type="number"
                min="5"
                max="200"
                value={floor[key]}
                onChange={(e) =>
                  updateLayout({
                    ...draft.layout,
                    floors: draft.layout.floors.map((f, i) =>
                      i === floorIndex ? { ...f, [key]: Number(e.target.value) } : f,
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
      </details>
      <div className="editor-tools flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
        <button className="secondary" onClick={addResource}>
          + Add resource
        </button>
        <button
          className="text-button"
          onClick={() => {
            if (!draft || draft.layout.floors.length >= 10) return;
            updateLayout({
              ...draft.layout,
              floors: [
                ...draft.layout.floors,
                {
                  id: crypto.randomUUID(),
                  name: `Floor ${draft.layout.floors.length + 1}`,
                  width: floor.width,
                  depth: floor.depth,
                  resources: [],
                  objects: [],
                },
              ],
            });
            setFloorIndex(draft.layout.floors.length);
            setSelected('');
          }}
        >
          + Add floor
        </button>
      </div>
      <div className="import-export mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
        <button className="text-button -ml-2" onClick={exportLayout}>
          <Download
            className="size-4 inline-block shrink-0"
            aria-hidden="true"
            strokeWidth={1.75}
          />{' '}
          Export JSON
        </button>
        <label className="file-button text-button relative m-0 cursor-pointer flex-row overflow-hidden">
          <Upload className="size-4 inline-block shrink-0" aria-hidden="true" strokeWidth={1.75} />{' '}
          Import JSON
          <input
            type="file"
            className="absolute inset-0 cursor-pointer opacity-0"
            accept=".json,application/json"
            onChange={(e) => {
              void importLayout(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </>
  );
}
