import fs from 'node:fs';
import path from 'node:path';

import { readRegistryFile, resolvePluginRoot, type PluginRegistryEntry } from '../schemas/registry.js';
import { tryRunGit } from './git.js';
import { scanPluginPolicy } from './policy.js';

export type ValidateOptions = {
  root: string;
  registryPath: string;
  baseSha?: string;
  headSha?: string;
  skipBuild: boolean;
};

export type ValidateResult = {
  changedPluginIds: string[];
  errors: string[];
  warnings: string[];
};

export async function validateRegistry(options: ValidateOptions): Promise<ValidateResult> {
  const registry = readRegistryFile(options.registryPath);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const plugin of registry.plugins) {
    validatePluginEntry(options.root, plugin, errors, warnings);
  }

  const changedPluginIds = detectChangedPluginIds({
    root: options.root,
    baseSha: options.baseSha,
    headSha: options.headSha,
    plugins: registry.plugins
  });

  if (!options.skipBuild && changedPluginIds.length > 0) {
    warnings.push(
      'build/check/pack execution is delegated to CI publish/validate workflow; local validate only checks registry and submodule consistency'
    );
  }

  return {
    changedPluginIds,
    errors,
    warnings
  };
}

export function detectChangedPluginIds(input: {
  root: string;
  baseSha?: string;
  headSha?: string;
  plugins: PluginRegistryEntry[];
}): string[] {
  const changedFiles = getChangedFiles(input.root, input.baseSha, input.headSha);

  if (changedFiles.length === 0) {
    return [];
  }

  if (changedFiles.some((file) => file === 'plugins.json' || file === '.gitmodules' || file.startsWith('events/'))) {
    return input.plugins.map((plugin) => plugin.pluginId).sort((a, b) => a.localeCompare(b));
  }

  const changedIds = new Set<string>();

  for (const plugin of input.plugins) {
    const normalizedSubmodule = normalizePath(plugin.submodule);
    if (
      changedFiles.some(
        (file) =>
          file === normalizedSubmodule ||
          file.startsWith(`${normalizedSubmodule}/`) ||
          file === plugin.review ||
          file === plugin.latestPublishEvent ||
          file === plugin.latestRevokeEvent
      )
    ) {
      changedIds.add(plugin.pluginId);
    }
  }

  return [...changedIds].sort((a, b) => a.localeCompare(b));
}

function validatePluginEntry(
  root: string,
  plugin: PluginRegistryEntry,
  errors: string[],
  warnings: string[]
): void {
  const submodulePath = path.join(root, plugin.submodule);
  const pluginRoot = resolvePluginRoot(root, plugin);

  if (!fs.existsSync(submodulePath)) {
    errors.push(`${plugin.pluginId}: submodule path does not exist: ${plugin.submodule}`);
    return;
  }

  if (!fs.existsSync(pluginRoot)) {
    errors.push(`${plugin.pluginId}: plugin path does not exist: ${path.join(plugin.submodule, plugin.path)}`);
    return;
  }

  const actualCommit = tryRunGit(['-C', submodulePath, 'rev-parse', 'HEAD'], root);
  if (!actualCommit) {
    errors.push(`${plugin.pluginId}: unable to read submodule commit at ${plugin.submodule}`);
  } else if (!actualCommit.toLowerCase().startsWith(plugin.commit.toLowerCase())) {
    errors.push(
      `${plugin.pluginId}: registry commit ${plugin.commit} does not match submodule HEAD ${actualCommit}`
    );
  }

  const packageJson = path.join(pluginRoot, 'package.json');
  const indexTs = path.join(pluginRoot, 'index.ts');

  if (!fs.existsSync(packageJson)) {
    errors.push(`${plugin.pluginId}: package.json is required at ${path.relative(root, packageJson)}`);
  }

  if (!fs.existsSync(indexTs)) {
    errors.push(`${plugin.pluginId}: index.ts is required at ${path.relative(root, indexTs)}`);
  }

  if (!fs.existsSync(path.join(pluginRoot, 'README.md'))) {
    warnings.push(`${plugin.pluginId}: README.md is recommended`);
  }

  const policy = scanPluginPolicy(pluginRoot);
  errors.push(...policy.errors.map((issue) => `${plugin.pluginId}: ${issue}`));
  warnings.push(...policy.warnings.map((issue) => `${plugin.pluginId}: ${issue}`));
}

function getChangedFiles(root: string, baseSha?: string, headSha = 'HEAD'): string[] {
  if (!baseSha) {
    return [];
  }

  const output = tryRunGit(
    ['diff', '--name-only', baseSha, headSha, '--', 'plugins.json', '.gitmodules', 'plugins', 'reviews', 'events'],
    root
  );
  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .map(normalizePath);
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

async function main(): Promise<void> {
  const root = process.cwd();
  const args = new Map<string, string | boolean>();

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--') {
      continue;
    }

    if (arg === '--skip-build') {
      args.set('skipBuild', true);
      continue;
    }

    if (arg.startsWith('--')) {
      args.set(arg.slice(2), process.argv[i + 1]);
      i += 1;
    }
  }

  const result = await validateRegistry({
    root,
    registryPath: path.resolve(root, String(args.get('registry') ?? 'plugins.json')),
    baseSha: typeof args.get('base') === 'string' ? String(args.get('base')) : undefined,
    headSha: typeof args.get('head') === 'string' ? String(args.get('head')) : undefined,
    skipBuild: Boolean(args.get('skipBuild'))
  });

  for (const warning of result.warnings) {
    console.warn(`WARN: ${warning}`);
  }

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        changedPluginIds: result.changedPluginIds
      },
      null,
      2
    )
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
