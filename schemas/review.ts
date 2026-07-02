import fs from 'node:fs';

import { z } from 'zod';

import { PluginIdSchema } from './registry.js';

export const AiReviewVerdictSchema = z.object({
  pluginId: PluginIdSchema,
  version: z.string().min(1),
  verdict: z.enum(['pass', 'warn', 'fail']),
  summary: z.string().min(1),
  generatedAt: z.iso.datetime().optional()
});

export type AiReviewVerdict = z.infer<typeof AiReviewVerdictSchema>;

export function readAiReviewVerdict(filePath: string): AiReviewVerdict {
  const raw = fs.readFileSync(filePath, 'utf8');
  return AiReviewVerdictSchema.parse(JSON.parse(raw));
}
