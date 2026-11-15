import { loginSchema } from '@openvenue/contracts';
import type { z } from 'zod';

export { loginSchema };

export type LoginDto = z.infer<typeof loginSchema>;
