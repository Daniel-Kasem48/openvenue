import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTemplate } from '@openvenue/contracts';
import { expandBlueprint, generateScene } from '../apps/api/src/scene-generation';
function blueprint() {
  const { id: _id, kind: _kind, ...seat } = makeTemplate('cinema').floors[0].resources[0];
  return {
    summary: 'Three rising rows with four seats each.',
    pricing: { mode: 'uniform', currency: 'USD', amount: 1500 },
    floors: [
      {
        name: 'Auditorium',
        width: 16,
        depth: 16,
        objects: [],
        groups: [
          { ...seat, x: 2, y: 2, rows: 3, columns: 4, spacingX: 1.5, spacingY: 2, rowRise: 0.4 },
        ],
      },
    ],
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('Claude scene generation', () => {
  it('expands repeat groups into independently editable places with unique IDs and rising rows', () => {
    const { layout } = expandBlueprint(blueprint(), 'cinema');
    const seats = layout.floors[0].resources;
    expect(seats).toHaveLength(12);
    expect(new Set(seats.map((s) => s.id)).size).toBe(12);
    expect(seats[11]).toMatchObject({ x: 6.5, y: 6, elevation: 0.8, kind: 'seat', capacity: 1 });
    expect(layout.pricing.amount).toBe(1500);
  });
  it('rejects oversized groups before expansion and rejects off-floor layouts', () => {
    const data = blueprint();
    data.floors[0].groups[0].rows = 100;
    data.floors[0].groups[0].columns = 100;
    expect(() => expandBlueprint(data, 'stadium')).toThrow('1,000');
    data.floors[0].groups[0].rows = 1;
    data.floors[0].groups[0].columns = 1;
    data.floors[0].groups[0].x = 0;
    expect(() => expandBlueprint(data, 'cinema')).toThrow('fit inside');
  });
  it('does not call Claude without a server key', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(generateScene('Build a cinema', 'cinema', {})).rejects.toMatchObject({
      status: 503,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends a constrained server-side request and validates its JSON response', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: JSON.stringify(blueprint()) }],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await generateScene('Twelve seats in three rows', 'cinema', {
      apiKey: 'test-secret',
    });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('test-secret');
    const body = JSON.parse(options.body);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.messages[0].content).toBe('Twelve seats in three rows');
    expect(JSON.stringify(body.output_config.format.schema)).not.toContain('"maximum":');
    expect(result.layout.floors[0].resources).toHaveLength(12);
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });
  it.each([401, 429, 500])(
    'handles provider HTTP %i without exposing its response',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('private upstream details', { status })),
      );
      await expect(
        generateScene('Build a venue', 'restaurant', { apiKey: 'test-secret' }),
      ).rejects.toThrow(/Claude/);
    },
  );
  it('repairs invalid decorative dimensions once while preserving two parking floors', async () => {
    const data = blueprint();
    data.floors[0].groups[0] = {
      ...data.floors[0].groups[0],
      rows: 2,
      columns: 5,
      rowRise: 0,
      spacingX: 2.6,
      spacingY: 7,
      width: 2.5,
      depth: 5,
      x: 2,
      y: 3,
    };
    data.floors[0].width = 20;
    data.floors[0].depth = 18;
    data.floors.push(structuredClone(data.floors[0]));
    const invalid = {
      ...data,
      floors: data.floors.map((f) => ({
        ...f,
        objects: [
          {
            label: 'Lane sign',
            kind: 'label',
            x: 10,
            y: 15,
            width: 5,
            depth: 0.2,
            height: 0.1,
            rotation: 0,
            color: '#F1C40F',
          },
        ],
      })),
    };
    const corrected = structuredClone(invalid);
    for (const floor of corrected.floors) floor.objects[0].depth = 0.3;
    const response = (value: unknown) =>
      new Response(
        JSON.stringify({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: JSON.stringify(value) }],
        }),
      );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(invalid))
      .mockResolvedValueOnce(response(corrected));
    vi.stubGlobal('fetch', fetch);
    const result = await generateScene(
      'parking building with 2 Storey ,each 10 parking slots',
      'parking',
      { apiKey: 'test-secret' },
    );
    expect(result.layout.floors.map((f) => f.resources.length)).toEqual([10, 10]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(fetch.mock.calls[1][1].body);
    expect(retry.messages[1].role).toBe('assistant');
    expect(retry.messages[2].content).toContain('floors.0.objects.0.depth');
    expect(retry.messages[2].content).toContain('0.3');
    expect(fetch.mock.calls[0][1].signal).toBe(fetch.mock.calls[1][1].signal);
  });
  it('rejects truncated and invalid output', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [] })));
    vi.stubGlobal('fetch', fetch);
    await expect(
      generateScene('Build a venue', 'restaurant', { apiKey: 'test-secret' }),
    ).rejects.toThrow('incomplete');
    fetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: '{\"floors\":[]}' }],
          }),
        ),
    );
    await expect(
      generateScene('Build a venue', 'restaurant', { apiKey: 'test-secret' }),
    ).rejects.toThrow('automatic correction');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
