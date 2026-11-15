import { z } from 'zod';

export const generateSceneSchema = z.object({ prompt: z.string().trim().min(10).max(4000) });
export type GenerateSceneDto = z.infer<typeof generateSceneSchema>;
