import fs from 'node:fs';
import path from 'node:path';

import { RevokeEventSchema, type RevokeEvent, type RevokeReason } from '../schemas/event.js';
import { PluginRegistrySchema, readRegistryFile, type PluginRegistry } from '../schemas/registry.js';

export type RevokeOptions = {
  root: string;
  registryPath: string;
  pluginId: string;
  version?: string;
  reason: RevokeReason;
  details: string;
  eventDir: string;
  actor: string;
  marketplaceReleaseId?: string;
};

export function revokePlugin(options: RevokeOptions): RevokeEvent {
  const registry = readRegistryFile(options.registryPath);
  const plugin = registry.plugins.find(
    (entry) => entry.pluginId === options.pluginId && (!options.version || entry.version === options.version)
  );

  if (!plugin) {
    throw new Error(`Plugin not found in registry: ${options.pluginId}${options.version ? `@${options.version}` : ''}`);
  }

  const createdAt = new Date().toISOString();
  const event: RevokeEvent = {
    schemaVersion: 1,
    eventType: 'revoked',
    pluginId: plugin.pluginId,
    version: plugin.version,
    reason: options.reason,
    details: options.details,
    marketplace: {
      releaseId: options.marketplaceReleaseId ?? null,
      visibility: 'hidden',
      newInstallsAllowed: false
    },
    actor: options.actor,
    createdAt
  };
  const eventPath = writeRevokeEvent(options.root, options.eventDir, event);

  plugin.status = 'revoked';
  plugin.latestRevokeEvent = path.relative(options.root, eventPath).split(path.sep).join('/');
  writeRegistryFile(options.registryPath, registry);

  return event;
}

function writeRevokeEvent(root: string, eventDir: string, event: RevokeEvent): string {
  const parsed = RevokeEventSchema.parse(event);
  const dir = path.resolve(root, eventDir, event.createdAt.slice(0, 10));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = resolveUniqueEventPath(dir, `${event.pluginId}-${event.version}-${eventTimestamp(event)}-revoked`);
  fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return filePath;
}

function writeRegistryFile(registryPath: string, registry: PluginRegistry): void {
  const parsed = PluginRegistrySchema.parse(registry);
  fs.writeFileSync(registryPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function eventTimestamp(event: Pick<RevokeEvent, 'createdAt'>): string {
  return event.createdAt.replace(/\D/g, '');
}

function resolveUniqueEventPath(dir: string, basename: string): string {
  let filePath = path.join(dir, `${basename}.json`);
  for (let index = 2; fs.existsSync(filePath); index += 1) {
    filePath = path.join(dir, `${basename}-${index}.json`);
  }

  return filePath;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const args = new Map<string, string>();

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--') {
      continue;
    }

    if (arg.startsWith('--')) {
      args.set(arg.slice(2), process.argv[i + 1]);
      i += 1;
    }
  }

  const pluginId = args.get('plugin');
  const reason = args.get('reason') as RevokeReason | undefined;
  const details = args.get('details');
  if (!pluginId || !reason || !details) {
    throw new Error('Usage: pnpm revoke -- --plugin <pluginId> --reason <reason> --details <text>');
  }

  const event = revokePlugin({
    root,
    registryPath: path.resolve(root, args.get('registry') ?? 'plugins.json'),
    pluginId,
    version: args.get('version'),
    reason,
    details,
    eventDir: args.get('event-dir') ?? 'events',
    actor: args.get('actor') ?? process.env.GITHUB_ACTOR ?? 'local',
    marketplaceReleaseId: args.get('marketplace-release-id')
  });

  console.log(JSON.stringify(event, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
