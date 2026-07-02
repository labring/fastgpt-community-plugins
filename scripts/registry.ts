import fs from 'node:fs';
import path from 'node:path';

import {
  parseRegistryJson,
  type PluginRegistry,
  type PluginRegistryEntry
} from '../schemas/registry.js';
import { tryRunGit } from './git.js';

type RegistryStatus = PluginRegistryEntry['status'];

export type UpsertRegistryOptions = {
  root: string;
  registryPath: string;
  pluginId?: string;
  version?: string;
  source?: string;
  commit?: string;
  submodule?: string;
  pluginPath?: string;
  review?: string;
  status?: RegistryStatus;
  from?: string;
  dryRun: boolean;
};

export type UpsertRegistryResult = {
  action: 'created' | 'updated';
  entry: PluginRegistryEntry;
  registryPath: string;
  wroteFile: boolean;
  submoduleCommand?: string;
};

type InferredPlugin = {
  pluginId?: string;
  version?: string;
  source?: string;
  commit?: string;
  submodule?: string;
  pluginPath?: string;
};

export function upsertRegistryEntry(options: UpsertRegistryOptions): UpsertRegistryResult {
  const registry = readOrCreateRegistry(options.registryPath);
  const inferred = options.from ? inferPluginFromPath(options.root, options.from) : {};
  const pluginId = requireValue(options.pluginId ?? inferred.pluginId, '--plugin');
  const version = requireValue(options.version ?? inferred.version, '--version');
  const source = requireValue(options.source ?? inferred.source, '--source');
  const commit = requireValue(options.commit ?? inferred.commit, '--commit');
  const existingIndex = registry.plugins.findIndex((entry) => entry.pluginId === pluginId);
  const existing = existingIndex >= 0 ? registry.plugins[existingIndex] : undefined;
  const submodule = options.submodule ?? inferred.submodule ?? `plugins/${pluginId}`;
  const pluginPath = options.pluginPath ?? inferred.pluginPath ?? '.';
  const review = options.review ?? `reviews/${pluginId}/${version}.json`;
  const status = options.status ?? existing?.status ?? 'pending';
  const entry: PluginRegistryEntry = {
    ...(existing && existing.version === version
      ? {
          latestPublishEvent: existing.latestPublishEvent,
          latestRevokeEvent: existing.latestRevokeEvent
        }
      : {}),
    pluginId,
    version,
    type: 'tool',
    source,
    commit,
    submodule,
    path: pluginPath,
    status,
    support: 'community',
    review
  };

  if (existingIndex >= 0) {
    registry.plugins[existingIndex] = entry;
  } else {
    registry.plugins.push(entry);
  }

  registry.plugins.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  const parsed = parseRegistryJson(registry);

  if (!options.dryRun) {
    fs.writeFileSync(options.registryPath, `${JSON.stringify(parsed, null, 2)}\n`);
  }

  const submodulePath = path.join(options.root, submodule);
  const result: UpsertRegistryResult = {
    action: existingIndex >= 0 ? 'updated' : 'created',
    entry,
    registryPath: options.registryPath,
    wroteFile: !options.dryRun
  };

  if (!fs.existsSync(submodulePath)) {
    result.submoduleCommand = `git submodule add ${source} ${submodule} && git -C ${submodule} checkout ${commit}`;
  }

  return result;
}

export function pluginIdFromPackageName(packageName: string): string {
  const unscopedName = packageName.includes('/') ? packageName.split('/').at(-1) ?? packageName : packageName;
  const baseName = unscopedName.replace(/^fastgpt-tools-/, '').replace(/^fastgpt-plugin-/, '');
  return toLowerCamelCase(baseName);
}

function readOrCreateRegistry(registryPath: string): PluginRegistry {
  if (!fs.existsSync(registryPath)) {
    return { version: 1, plugins: [] };
  }

  const raw = fs.readFileSync(registryPath, 'utf8');
  return parseRegistryJson(JSON.parse(raw));
}

function inferPluginFromPath(root: string, from: string): InferredPlugin {
  const pluginRoot = path.resolve(root, from);
  const packageJsonPath = path.join(pluginRoot, 'package.json');
  const inferred: InferredPlugin = {};

  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      name?: unknown;
      version?: unknown;
    };
    if (typeof packageJson.name === 'string') {
      inferred.pluginId = pluginIdFromPackageName(packageJson.name);
    }
    if (typeof packageJson.version === 'string') {
      inferred.version = packageJson.version;
    }
  }

  const source = tryRunGit(['-C', pluginRoot, 'remote', 'get-url', 'origin'], root);
  if (source) {
    inferred.source = source;
  }

  const commit = tryRunGit(['-C', pluginRoot, 'rev-parse', 'HEAD'], root);
  if (commit) {
    inferred.commit = commit;
  }

  const relativePath = path.relative(root, pluginRoot).split(path.sep).join('/');
  if (relativePath.startsWith('plugins/')) {
    const [pluginsDir, pluginDir, ...rest] = relativePath.split('/');
    if (pluginsDir && pluginDir) {
      inferred.submodule = `${pluginsDir}/${pluginDir}`;
      inferred.pluginPath = rest.length > 0 ? rest.join('/') : '.';
    }
  }

  return inferred;
}

function toLowerCamelCase(value: string): string {
  const words = value.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) {
    return value;
  }

  const [firstWord, ...restWords] = words;
  const first = lowerFirst(firstWord ?? '');
  return `${first}${restWords.map(capitalize).join('')}`;
}

function lowerFirst(value: string): string {
  return value ? `${value[0]?.toLowerCase()}${value.slice(1)}` : value;
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`${flag} is required; pass it explicitly or use --from <plugin-path> for inference`);
  }

  return value;
}

function parseArgs(argv: string[]): { command: string; args: Map<string, string | boolean> } {
  const args = new Map<string, string | boolean>();
  let command = 'upsert';
  let index = 0;

  if (argv[0] && !argv[0].startsWith('--')) {
    command = argv[0];
    index = 1;
  }

  for (let i = index; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      continue;
    }

    if (arg === '--dry-run') {
      args.set('dryRun', true);
      continue;
    }

    if (arg.startsWith('--')) {
      args.set(arg.slice(2), argv[i + 1]);
      i += 1;
    }
  }

  return { command, args };
}

async function main(): Promise<void> {
  const root = process.cwd();
  const { command, args } = parseArgs(process.argv.slice(2));

  if (command !== 'upsert') {
    throw new Error(
      'Usage: pnpm run registry -- upsert --plugin <pluginId> --version <version> --source <repo-url> --commit <sha>'
    );
  }

  const result = upsertRegistryEntry({
    root,
    registryPath: path.resolve(root, String(args.get('registry') ?? 'plugins.json')),
    pluginId: readStringArg(args, 'plugin'),
    version: readStringArg(args, 'version'),
    source: readStringArg(args, 'source'),
    commit: readStringArg(args, 'commit'),
    submodule: readStringArg(args, 'submodule'),
    pluginPath: readStringArg(args, 'path'),
    review: readStringArg(args, 'review'),
    status: readStringArg(args, 'status') as RegistryStatus | undefined,
    from: readStringArg(args, 'from'),
    dryRun: Boolean(args.get('dryRun'))
  });

  console.log(JSON.stringify(result, null, 2));
}

function readStringArg(args: Map<string, string | boolean>, name: string): string | undefined {
  const value = args.get(name);
  return typeof value === 'string' ? value : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
