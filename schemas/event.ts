import fs from 'node:fs';

import { z } from 'zod';

import { PluginIdSchema } from './registry.js';

const EventPathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith('/'), 'must be a relative path')
  .refine((value) => !value.split(/[\\/]+/).includes('..'), 'must not contain .. segments');

const SourceSchema = z.object({
  repo: z.string().url(),
  commit: z.string().min(7),
  submodule: EventPathSchema,
  path: EventPathSchema
});

const MarketplaceSchema = z.object({
  releaseId: z.string().min(1).nullable(),
  uploaded: z.boolean().optional(),
  visibility: z.enum(['listed', 'hidden', 'unknown']).default('unknown'),
  newInstallsAllowed: z.boolean().optional()
});

export const PublishEventSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal('published'),
  pluginId: PluginIdSchema,
  version: z.string().min(1),
  source: SourceSchema,
  package: z.object({
    file: z.string().min(1),
    sha256: z.string().length(64),
    sizeBytes: z.number().int().nonnegative()
  }),
  review: z.object({
    verdict: z.literal('pass'),
    reviewFile: EventPathSchema.optional(),
    summary: z.string().min(1),
    generatedAt: z.string().nullable()
  }),
  marketplace: MarketplaceSchema,
  actor: z.string().min(1),
  createdAt: z.iso.datetime()
});

export const RevokeReasonSchema = z.enum([
  'security-risk',
  'broken',
  'policy-violation',
  'maintainer-request',
  'duplicate',
  'other'
]);

export const RevokeEventSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal('revoked'),
  pluginId: PluginIdSchema,
  version: z.string().min(1),
  reason: RevokeReasonSchema,
  details: z.string().min(1),
  marketplace: MarketplaceSchema,
  actor: z.string().min(1),
  createdAt: z.iso.datetime()
});

export const LifecycleEventSchema = z.discriminatedUnion('eventType', [PublishEventSchema, RevokeEventSchema]);

export type PublishEvent = z.infer<typeof PublishEventSchema>;
export type RevokeEvent = z.infer<typeof RevokeEventSchema>;
export type LifecycleEvent = z.infer<typeof LifecycleEventSchema>;
export type RevokeReason = z.infer<typeof RevokeReasonSchema>;

export function readLifecycleEventFile(filePath: string): LifecycleEvent {
  const raw = fs.readFileSync(filePath, 'utf8');
  return LifecycleEventSchema.parse(JSON.parse(raw));
}
