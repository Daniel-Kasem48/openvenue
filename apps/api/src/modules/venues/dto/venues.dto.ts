import { createVenueSchema, patchVenueSchema, saveVenueSchema } from '@openvenue/contracts';
import type { z } from 'zod';

export { createVenueSchema, patchVenueSchema, saveVenueSchema };
export type CreateVenueDto = z.infer<typeof createVenueSchema>;
export type PatchVenueDto = z.infer<typeof patchVenueSchema>;
export type SaveVenueDto = z.infer<typeof saveVenueSchema>;
