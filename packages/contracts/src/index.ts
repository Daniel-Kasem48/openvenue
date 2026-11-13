import { z } from 'zod';
export const kindSchema = z.enum(['restaurant', 'parking', 'cinema']);
export type VenueKind = z.infer<typeof kindSchema>;
const name = z.string().trim().min(1).max(100);
export const resourceSchema = z.object({
  id: z.uuid(),
  label: name,
  kind: z.enum(['table', 'space', 'seat']),
  x: z.number().min(0).max(200),
  y: z.number().min(0).max(200),
  width: z.number().min(0.3).max(20),
  depth: z.number().min(0.3).max(20),
  rotation: z.number().min(0).max(360),
  capacity: z.number().int().min(1).max(50),
  accessible: z.boolean(),
  ev: z.boolean(),
});
export type Resource = z.infer<typeof resourceSchema>;
export const floorSchema = z.object({
  id: z.uuid(),
  name,
  width: z.number().min(5).max(200),
  depth: z.number().min(5).max(200),
  resources: z.array(resourceSchema).max(1000),
});
export const layoutSchema = z
  .object({ version: z.literal(1), floors: z.array(floorSchema).min(1).max(10) })
  .superRefine((layout, ctx) => {
    const ids = new Set<string>();
    for (const floor of layout.floors) {
      for (const id of [floor.id, ...floor.resources.map((r) => r.id)]) {
        if (ids.has(id)) ctx.addIssue({ code: 'custom', message: 'Identifiers must be unique' });
        ids.add(id);
      }
      for (const r of floor.resources) {
        const angle = (r.rotation * Math.PI) / 180;
        const extentX =
          (Math.abs(r.width * Math.cos(angle)) + Math.abs(r.depth * Math.sin(angle))) / 2;
        const extentY =
          (Math.abs(r.width * Math.sin(angle)) + Math.abs(r.depth * Math.cos(angle))) / 2;
        if (
          r.x - extentX < -0.001 ||
          r.y - extentY < -0.001 ||
          r.x + extentX > floor.width + 0.001 ||
          r.y + extentY > floor.depth + 0.001
        )
          ctx.addIssue({ code: 'custom', message: `${r.label} must fit inside its floor` });
      }
    }
  });
export type Layout = z.infer<typeof layoutSchema>;
export type Floor = Layout['floors'][number];
export type Venue = { id: string; name: string; kind: VenueKind; layout: Layout; revision: number };
export type Show = { id: string; title: string; start: string; end: string };
export type Booking = {
  id: string;
  venueId: string;
  resourceId: string;
  guestName: string;
  start: string;
  end: string;
  status: 'confirmed' | 'cancelled';
  venueName?: string;
  resourceLabel?: string;
};
export const createVenueSchema = z.object({
  name,
  kind: kindSchema,
  sourceId: z.uuid().optional(),
});
export const saveVenueSchema = z.object({
  name,
  layout: layoutSchema,
  revision: z.number().int().min(1),
});
export const intervalSchema = z
  .object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) })
  .refine(
    (v) =>
      Date.parse(v.end) > Date.parse(v.start) &&
      Date.parse(v.end) - Date.parse(v.start) <= 7 * 86400000,
    { message: 'Choose a positive interval of at most seven days' },
  );
export const bookingSchema = z.object({
  venueId: z.uuid(),
  resourceId: z.uuid(),
  guestName: name,
  start: z.iso.datetime({ offset: true }).optional(),
  end: z.iso.datetime({ offset: true }).optional(),
  showId: z.uuid().optional(),
});
export { makeTemplate, cloneLayout } from './templates';
