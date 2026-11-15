import { overviewRangeSchema } from '@openvenue/contracts';
import type { z } from 'zod';

export { overviewRangeSchema };

export type OverviewRangeDto = z.infer<typeof overviewRangeSchema>;
