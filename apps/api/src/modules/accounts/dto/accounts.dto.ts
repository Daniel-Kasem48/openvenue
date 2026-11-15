import { createAccountSchema, updateAccountSchema } from '@openvenue/contracts';
import type { z } from 'zod';

export { createAccountSchema, updateAccountSchema };

export type CreateAccountDto = z.infer<typeof createAccountSchema>;
export type UpdateAccountDto = z.infer<typeof updateAccountSchema>;
