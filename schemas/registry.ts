import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

const RelativePluginPathSchema = z
  .string()
  .min(1)
  .refine((value) => !path.isAbsolute(value), 'must be a relative path')
  .refine((value) => !value.split(/[\\/]+/).includes('..'), 'must not contain .. segments');

export const PluginIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-zA-Z0-9]*$/, 'must use lower camelCase letters and numbers');

const CommitSchema = z
  .string()
  .min(7)
  .regex(/^[0-9a-f]{7,40}$/i, 'must be a git commit sha');

const VersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, 'must be a semver-like version');

export const PluginRegistryEntrySchema = z.object({
  pluginId: PluginIdSchema,
  version: VersionSchema,
  type: z.literal('tool'),
  source: z.string().url(),
  commit: CommitSchema,
  submodule: RelativePluginPathSchema.refine(
    (value) => value.startsWith('plugins/'),
    'must live under plugins/'
  ),
  path: RelativePluginPathSchema.default('.'),
  status: z.enum(['pending', 'active', 'revoked', 'deprecated', 'rejected']).default('pending'),
  support: z.enum(['community']).default('community'),
  review: RelativePluginPathSchema.optional(),
  latestPublishEvent: RelativePluginPathSchema.optional(),
  latestRevokeEvent: RelativePluginPathSchema.optional()
});

export const PluginRegistrySchema = z.object({
  version: z.literal(1),
  plugins: z.array(PluginRegistryEntrySchema)
});

export type PluginRegistry = z.infer<typeof PluginRegistrySchema>;
export type PluginRegistryEntry = z.infer<typeof PluginRegistryEntrySchema>;

export type RegistryValidationIssue = {
  path: string;
  message: string;
};

export function parseRegistryJson(input: unknown): PluginRegistry {
  const registry = PluginRegistrySchema.parse(input);
  assertUniquePluginIds(registry);
  return registry;
}

export function readRegistryFile(filePath: string): PluginRegistry {
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseRegistryJson(JSON.parse(raw));
}

export function validateRegistryJson(input: unknown): RegistryValidationIssue[] {
  const result = PluginRegistrySchema.safeParse(input);
  const issues: RegistryValidationIssue[] = [];

  if (!result.success) {
    return result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '<root>',
      message: issue.message
    }));
  }

  try {
    assertUniquePluginIds(result.data);
  } catch (error) {
    issues.push({
      path: 'plugins',
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return issues;
}

export function resolvePluginRoot(repoRoot: string, plugin: PluginRegistryEntry): string {
  return path.join(repoRoot, plugin.submodule, plugin.path);
}

function assertUniquePluginIds(registry: PluginRegistry): void {
  const seen = new Set<string>();

  for (const plugin of registry.plugins) {
    if (seen.has(plugin.pluginId)) {
      throw new Error(`duplicate pluginId: ${plugin.pluginId}`);
    }

    seen.add(plugin.pluginId);
  }
}
