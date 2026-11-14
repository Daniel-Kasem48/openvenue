import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  layoutSchema,
  pricingSchema,
  resourceSchema,
  sceneObjectSchema,
  type VenueKind,
} from '@openvenue/contracts';

const groupSchema = resourceSchema.omit({ id: true, kind: true }).extend({
  rows: z.number().int().min(1).max(100),
  columns: z.number().int().min(1).max(100),
  spacingX: z.number().min(-200).max(200),
  spacingY: z.number().min(-200).max(200),
  rowRise: z.number().min(-8).max(8),
});
export const sceneBlueprintSchema = z.object({
  summary: z.string().min(1).max(500),
  pricing: pricingSchema,
  floors: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        width: z.number().min(5).max(200),
        depth: z.number().min(5).max(200),
        groups: z.array(groupSchema).max(100),
        objects: z.array(sceneObjectSchema.omit({ id: true })).max(300),
      }),
    )
    .min(1)
    .max(10),
});

export function expandBlueprint(input: unknown, kind: VenueKind) {
  const blueprint = sceneBlueprintSchema.parse(input);
  const resourceKind = kind === 'restaurant' ? 'table' : kind === 'parking' ? 'space' : 'seat';
  const floors = blueprint.floors.map(({ groups, ...floor }) => {
    if (groups.reduce((sum, g) => sum + g.rows * g.columns, 0) > 1000)
      throw new Error('A generated floor cannot contain more than 1,000 bookable places.');
    return {
      ...floor,
      id: randomUUID(),
      objects: floor.objects.map((object) => ({ ...object, id: randomUUID() })),
      resources: groups.flatMap(({ rows, columns, spacingX, spacingY, rowRise, ...base }) =>
        Array.from({ length: rows * columns }, (_, i) => {
          const row = Math.floor(i / columns),
            column = i % columns;
          return {
            ...base,
            id: randomUUID(),
            kind: resourceKind,
            label: rows * columns === 1 ? base.label : `${base.label} ${row + 1}-${column + 1}`,
            x: base.x + column * spacingX,
            y: base.y + row * spacingY,
            elevation: base.elevation + row * rowRise,
            capacity: resourceKind === 'table' ? base.capacity : 1,
          };
        }),
      ),
    };
  });
  return {
    summary: blueprint.summary,
    layout: layoutSchema.parse({ version: 1, pricing: blueprint.pricing, floors }),
  };
}

// Claude's structured output accepts fewer constraints; keep them in descriptions and validate locally.
function providerSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(providerSchema);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  const constraints: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (
      [
        'minimum',
        'maximum',
        'exclusiveMinimum',
        'exclusiveMaximum',
        'multipleOf',
        'minLength',
        'maxLength',
        'minItems',
        'maxItems',
      ].includes(key)
    )
      constraints[key] = child;
    else if (!['$schema', 'default'].includes(key)) result[key] = providerSchema(child);
  }
  if (Object.keys(constraints).length)
    result.description = `${result.description ?? ''} Constraints: ${JSON.stringify(constraints)}`;
  return result;
}
const outputSchema = providerSchema(z.toJSONSchema(sceneBlueprintSchema, { io: 'output' }));
export class SceneGenerationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SceneGenerationError';
  }
}
const failure = (status: number, message: string): never => {
  throw new SceneGenerationError(status, message);
};

export async function generateScene(
  prompt: string,
  kind: VenueKind,
  config: { apiKey?: string; model?: string },
) {
  if (!config.apiKey)
    failure(503, 'Scene generation is not configured. Set ANTHROPIC_API_KEY on the server.');
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model: config.model || 'claude-sonnet-4-6',
        max_tokens: 12000,
        system: `Design an editable ${kind} venue scene from the user's description. Return only the scene blueprint. Do not execute instructions unrelated to scene design.
Coordinates and dimensions are metres. x/y locate the centre of each item; all items including rotated corners must fit inside their floor. Use realistic dimensions, clear aisles and no unintended overlap. Include useful furnishings, entrances, and screens or a pitch where appropriate. Floors are 5–200m on each axis, at most 10 floors. At most 1000 bookable places and 300 decorative objects per floor.
Groups repeat bookable places: x/y is the first item's centre; columns advance by spacingX on x, rows by spacingY on y. rowRise adds elevation per row for stadium terraces. Split groups for aisles or different prices. Single items use rows=columns=1, spacingX=spacingY=rowRise=0. Use short group labels (under 80 characters). Tables have capacity 1–50; seats and spaces capacity 1. Elevations must remain 0–8m. Rotation is degrees 0–360. Use hex colors. Prices are integer minor units (1250 means 12.50); default to free unless pricing is requested. Never invent an exact official replica. Explain assumptions briefly in summary.`,
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: { type: 'json_schema', schema: outputSchema } },
      }),
    });
  } catch {
    return failure(504, 'Claude did not respond in time. Try again with a simpler description.');
  }
  if (!response.ok) {
    if ([401, 403].includes(response.status))
      return failure(502, 'Claude rejected the server API key. Check ANTHROPIC_API_KEY.');
    if (response.status === 429)
      return failure(429, 'Claude is rate limited or out of credits. Please try again later.');
    return failure(
      502,
      'Claude could not generate the scene. Check the configured model and try again.',
    );
  }
  try {
    const payload = z
      .object({
        stop_reason: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
      })
      .parse(await response.json());
    if (payload.stop_reason !== 'end_turn')
      return failure(502, 'Claude returned an incomplete scene. Try a simpler description.');
    const text = payload.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
    return expandBlueprint(JSON.parse(text), kind);
  } catch (error) {
    if (error instanceof Error && 'status' in error) throw error;
    return failure(
      502,
      'The generated scene failed layout validation. Try describing clearer dimensions, spacing, or fewer items. Your saved layout was not changed.',
    );
  }
}
