import {
  currencySchema,
  makeObject,
  objectKinds,
  type SceneObject,
  type Venue,
  type Floor,
  type Resource,
  type Layout,
} from '@openvenue/contracts';
type Props = {
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
  const object = (floor.objects ?? []).find((o) => o.id === selected);
  const updateObjects = (objects: SceneObject[]) =>
    updateLayout({
      ...draft.layout,
      floors: draft.layout.floors.map((f, i) => (i === floorIndex ? { ...f, objects } : f)),
    });
  const patchObject = (patch: Partial<SceneObject>) =>
    updateObjects((floor.objects ?? []).map((o) => (o.id === selected ? { ...o, ...patch } : o)));
  return (
    <>
      <div className="eyebrow">LAYOUT STUDIO</div>
      <h3>Make it your own.</h3>
      <p className="muted">Select an item to edit. Drag it on the 2D map to move.</p>
      <details className="object-library" open>
        <summary>Reservation pricing</summary>
        <label>
          Pricing mode
          <select
            value={draft.layout.pricing.mode}
            onChange={(e) =>
              updateLayout({
                ...draft.layout,
                pricing: {
                  ...draft.layout.pricing,
                  mode: e.target.value as Layout['pricing']['mode'],
                },
              })
            }
          >
            <option value="free">Free reservations</option>
            <option value="uniform">Same price for every place</option>
            <option value="per-resource">Different price per seat / table / space</option>
          </select>
        </label>
        {draft.layout.pricing.mode !== 'free' && (
          <>
            <label>
              Currency
              <select
                value={draft.layout.pricing.currency}
                onChange={(e) =>
                  updateLayout({
                    ...draft.layout,
                    pricing: {
                      ...draft.layout.pricing,
                      currency: e.target.value as Layout['pricing']['currency'],
                    },
                  })
                }
              >
                {currencySchema.options.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {draft.layout.pricing.mode === 'uniform' && (
              <label>
                Standard reservation price
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  value={draft.layout.pricing.amount / 100}
                  onChange={(e) =>
                    updateLayout({
                      ...draft.layout,
                      pricing: {
                        ...draft.layout.pricing,
                        amount: Math.round(Number(e.target.value) * 100),
                      },
                    })
                  }
                />
              </label>
            )}
            <p className="muted">
              Per place, for the entire reservation. A table price covers the whole party. Payment
              is not collected here.
            </p>
          </>
        )}
      </details>
      <div className="editor-tools">
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
      <div className="field-grid">
        {(['width', 'depth'] as const).map((key) => (
          <label key={key}>
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
      <details className="object-library" open>
        <summary>Object library · {objectKinds.length} types</summary>
        <div className="object-palette">
          {objectKinds.map((kind) => (
            <button
              key={kind}
              type="button"
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
      {object && (
        <div className="resource-editor">
          <label>
            Object label
            <input value={object.label} onChange={(e) => patchObject({ label: e.target.value })} />
          </label>
          <div className="field-grid">
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
          <label>
            Object color
            <input
              type="color"
              value={object.color}
              onChange={(e) => patchObject({ color: e.target.value })}
            />
          </label>
          <button
            className="text-button danger"
            onClick={() => {
              updateObjects((floor.objects ?? []).filter((o) => o.id !== selected));
              setSelected('');
            }}
          >
            Remove object
          </button>
        </div>
      )}
      {resource && (
        <div className="resource-editor">
          <label>
            Resource label
            <input
              value={resource.label}
              onChange={(e) => updateResource({ label: e.target.value })}
            />
          </label>
          {draft.layout.pricing.mode === 'per-resource' && (
            <label>
              Reservation price ({draft.layout.pricing.currency})
              <input
                aria-label="Reservation price"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={resource.price / 100}
                onChange={(e) =>
                  updateResource({ price: Math.round(Number(e.target.value) * 100) })
                }
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
          <div className="field-grid">
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
          <label className="check">
            <input
              type="checkbox"
              checked={resource.accessible}
              onChange={(e) => updateResource({ accessible: e.target.checked })}
            />
            Accessible
          </label>
          {resource.kind === 'space' && (
            <label className="check">
              <input
                type="checkbox"
                checked={resource.ev}
                onChange={(e) => updateResource({ ev: e.target.checked })}
              />
              EV charging
            </label>
          )}
          <button
            className="text-button danger"
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
        </div>
      )}
      <div className="import-export">
        <button className="text-button" onClick={exportLayout}>
          ↓ Export JSON
        </button>
        <label className="file-button">
          ↑ Import JSON
          <input
            type="file"
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
