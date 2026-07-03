import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { input } from '@inquirer/prompts';
import { Command } from 'commander';

import { type RevokeReason } from '../schemas/event.js';
import { readRegistryFile, type PluginRegistryEntry } from '../schemas/registry.js';
import { publishPlugin } from './publish.js';
import { type RegistryStatus, inferPluginFromPath, upsertRegistryEntry } from './registry.js';
import { revokePlugin } from './revoke.js';
import { validateRegistry } from './validate.js';

type OutputMode = 'human' | 'json';

export type PluginCliContext = {
  root?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  stdinIsTTY?: boolean;
};

type CommonOptions = {
  registry?: string;
  json?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  interactive?: boolean;
};

type AddOptions = CommonOptions & {
  from?: string;
  plugin?: string;
  version?: string;
  source?: string;
  commit?: string;
  submodule?: string;
  path?: string;
  review?: string;
  status?: RegistryStatus;
};

type SyncOptions = CommonOptions & {
  path?: string;
  review?: string;
  status?: RegistryStatus;
};

type CheckOptions = CommonOptions & {
  base?: string;
  head?: string;
  skipBuild?: boolean;
};

type PublishCommandOptions = CommonOptions & {
  package?: string;
  review?: string;
  receiptDir?: string;
  eventDir?: string;
  actor?: string;
  skipBuild?: boolean;
};

type RevokeCommandOptions = CommonOptions & {
  version?: string;
  reason?: string;
  details?: string;
  eventDir?: string;
  actor?: string;
  marketplaceReleaseId?: string;
};

type DoctorOptions = {
  json?: boolean;
};

type DoctorCheck = {
  name: string;
  required: boolean;
  ok: boolean;
  version: string | null;
};

export function createPluginProgram(context: PluginCliContext = {}): Command {
  const program = new Command();
  const root = context.root ?? process.cwd();
  const stdout = context.stdout ?? ((message: string) => console.log(message));
  const stderr = context.stderr ?? ((message: string) => console.error(message));

  program
    .name('plugin')
    .description('Manage FastGPT community plugin registry, checks, publish, and revoke lifecycle.')
    .showHelpAfterError()
    .configureOutput({
      writeOut: (message) => stdout(message.replace(/\n$/, '')),
      writeErr: (message) => stderr(message.replace(/\n$/, ''))
    });

  program
    .command('doctor')
    .description('Check local tools used by plugin lifecycle commands.')
    .option('--json', 'print machine-readable JSON')
    .action((options: DoctorOptions) => {
      const checks = runDoctor(root);
      writeOutput(stdout, options.json ? 'json' : 'human', checks, formatDoctor(checks));
      if (checks.some((check) => check.required && !check.ok)) {
        throw new Error('Required plugin lifecycle tools are missing');
      }
    });

  program
    .command('add')
    .description('Add or update a plugin registry entry from explicit metadata or a local plugin path.')
    .argument('[from]', 'local plugin path, usually packages/tools/<pluginId>')
    .option('--from <path>', 'local plugin path, usually packages/tools/<pluginId>')
    .option('--plugin <pluginId>', 'lower camelCase plugin id')
    .option('--version <version>', 'plugin semver version')
    .option('--source <url>', 'plugin source repository URL')
    .option('--commit <sha>', 'plugin source commit SHA')
    .option('--submodule <path>', 'submodule path under packages/tools/')
    .option('--path <path>', 'nested plugin path inside the submodule')
    .option('--review <path>', 'review verdict path')
    .option('--status <status>', 'registry status')
    .option('--registry <path>', 'registry file path', 'plugins.json')
    .option('--dry-run', 'print result without writing plugins.json')
    .option('--json', 'print machine-readable JSON')
    .option('--yes', 'disable interactive prompts')
    .option('--no-interactive', 'disable interactive prompts')
    .action(async (fromArg: string | undefined, options: AddOptions) => {
      const result = await addPlugin(root, { ...options, from: options.from ?? fromArg }, context);
      const human = `${result.action} ${result.entry.pluginId}@${result.entry.version} in ${path.relative(
        root,
        result.registryPath
      ) || result.registryPath}${result.submoduleCommand ? `\nnext: ${result.submoduleCommand}` : ''}`;
      writeOutput(stdout, outputMode(options), result, human);
    });

  program
    .command('sync')
    .description('Refresh a registry entry from its pinned submodule path.')
    .argument('<pluginId>', 'plugin id to sync')
    .option('--path <path>', 'override nested plugin path inside the submodule')
    .option('--review <path>', 'review verdict path')
    .option('--status <status>', 'registry status')
    .option('--registry <path>', 'registry file path', 'plugins.json')
    .option('--dry-run', 'print result without writing plugins.json')
    .option('--json', 'print machine-readable JSON')
    .action((pluginId: string, options: SyncOptions) => {
      const result = syncPlugin(root, pluginId, options);
      writeOutput(stdout, outputMode(options), result, `synced ${result.entry.pluginId}@${result.entry.version}`);
    });

  program
    .command('check')
    .description('Validate registry state and optionally build selected plugin packages.')
    .argument('[pluginId]', 'plugin id to build/check')
    .option('--base <sha>', 'base git SHA for changed-plugin detection')
    .option('--head <sha>', 'head git SHA for changed-plugin detection', 'HEAD')
    .option('--skip-build', 'only run deterministic registry validation')
    .option('--registry <path>', 'registry file path', 'plugins.json')
    .option('--json', 'print machine-readable JSON')
    .action(async (pluginId: string | undefined, options: CheckOptions) => {
      const result = await checkPlugins(root, pluginId, options);
      writeOutput(stdout, outputMode(options), result, formatCheckResult(result));
      if (!result.ok) {
        throw new Error('Plugin check failed');
      }
    });

  program
    .command('publish')
    .description('Publish an approved plugin package through the existing publish flow.')
    .argument('<pluginId>', 'plugin id to publish')
    .option('--package <path>', 'prebuilt package path')
    .option('--review <path>', 'AI review verdict path')
    .option('--receipt-dir <dir>', 'receipt output directory', 'dist/receipts')
    .option('--event-dir <dir>', 'event output directory', 'events')
    .option('--actor <name>', 'publish actor')
    .option('--registry <path>', 'registry file path', 'plugins.json')
    .option('--dry-run', 'write a dry-run receipt without mutating registry state')
    .option('--skip-build', 'skip plugin-local install/build/pack')
    .option('--json', 'print machine-readable JSON')
    .action(async (pluginId: string, options: PublishCommandOptions) => {
      const receipt = await publishPlugin({
        root,
        registryPath: path.resolve(root, options.registry ?? 'plugins.json'),
        pluginId,
        packagePath: options.package,
        reviewPath: options.review,
        receiptDir: options.receiptDir ?? 'dist/receipts',
        eventDir: options.eventDir ?? 'events',
        actor: options.actor ?? context.env?.GITHUB_ACTOR ?? process.env.GITHUB_ACTOR ?? 'local',
        dryRun: Boolean(options.dryRun),
        skipBuild: Boolean(options.skipBuild)
      });
      writeOutput(stdout, outputMode(options), receipt, `published ${receipt.pluginId}@${receipt.version}`);
    });

  program
    .command('revoke')
    .description('Revoke a plugin in repository state and write a revoke lifecycle event.')
    .argument('<pluginId>', 'plugin id to revoke')
    .option('--version <version>', 'specific plugin version')
    .requiredOption('--reason <reason>', 'revoke reason')
    .requiredOption('--details <text>', 'human-readable revoke details')
    .option('--event-dir <dir>', 'event output directory', 'events')
    .option('--actor <name>', 'revoke actor')
    .option('--marketplace-release-id <id>', 'future marketplace release id pointer')
    .option('--registry <path>', 'registry file path', 'plugins.json')
    .option('--json', 'print machine-readable JSON')
    .action((pluginId: string, options: RevokeCommandOptions) => {
      const event = revokePlugin({
        root,
        registryPath: path.resolve(root, options.registry ?? 'plugins.json'),
        pluginId,
        version: options.version,
        reason: options.reason as RevokeReason,
        details: options.details ?? '',
        eventDir: options.eventDir ?? 'events',
        actor: options.actor ?? context.env?.GITHUB_ACTOR ?? process.env.GITHUB_ACTOR ?? 'local',
        marketplaceReleaseId: options.marketplaceReleaseId
      });
      writeOutput(stdout, outputMode(options), event, `revoked ${event.pluginId}@${event.version}`);
    });

  return program;
}

export async function runPluginCli(argv: string[], context: PluginCliContext = {}): Promise<void> {
  const program = createPluginProgram(context);
  program.exitOverride();
  await program.parseAsync(normalizePnpmRunArgs(argv), { from: 'user' });
}

function normalizePnpmRunArgs(argv: string[]): string[] {
  return argv[0] === '--' ? argv.slice(1) : argv;
}

async function addPlugin(root: string, options: AddOptions, context: PluginCliContext) {
  const from = options.from;
  const inferred = from ? inferPluginFromPath(root, from) : {};
  const promptEnabled = shouldPrompt(options, context);
  const pluginId = await resolveValue(options.plugin ?? inferred.pluginId, 'Plugin id', inferred.pluginId, promptEnabled);
  const version = await resolveValue(options.version ?? inferred.version, 'Version', inferred.version, promptEnabled);
  const source = await resolveValue(options.source ?? inferred.source, 'Source repository URL', inferred.source, promptEnabled);
  const commit = await resolveValue(options.commit ?? inferred.commit, 'Commit SHA', inferred.commit, promptEnabled);

  return upsertRegistryEntry({
    root,
    registryPath: path.resolve(root, options.registry ?? 'plugins.json'),
    pluginId,
    version,
    source,
    commit,
    submodule: options.submodule ?? inferred.submodule,
    pluginPath: options.path ?? inferred.pluginPath,
    review: options.review,
    status: options.status,
    from,
    dryRun: Boolean(options.dryRun)
  });
}

function syncPlugin(root: string, pluginId: string, options: SyncOptions) {
  const registryPath = path.resolve(root, options.registry ?? 'plugins.json');
  const registry = readRegistryFile(registryPath);
  const plugin = findPlugin(registry.plugins, pluginId);
  const inferred = inferPluginFromPath(root, path.join(plugin.submodule, options.path ?? plugin.path));
  const version = inferred.version ?? plugin.version;

  return upsertRegistryEntry({
    root,
    registryPath,
    pluginId: plugin.pluginId,
    version,
    source: inferred.source ?? plugin.source,
    commit: inferred.commit ?? plugin.commit,
    submodule: plugin.submodule,
    pluginPath: options.path ?? inferred.pluginPath ?? plugin.path,
    review: options.review ?? (version === plugin.version ? plugin.review : undefined),
    status: options.status ?? plugin.status,
    dryRun: Boolean(options.dryRun)
  });
}

async function checkPlugins(root: string, pluginId: string | undefined, options: CheckOptions) {
  const registryPath = path.resolve(root, options.registry ?? 'plugins.json');
  const validation = await validateRegistry({
    root,
    registryPath,
    baseSha: options.base,
    headSha: options.head,
    skipBuild: true
  });
  const registry = readRegistryFile(registryPath);
  const targetIds = resolveCheckTargets(registry.plugins, pluginId, validation.changedPluginIds, options);

  if (validation.errors.length === 0 && !options.skipBuild) {
    const { buildPluginPackage } = await import('./publish.js');
    for (const targetId of targetIds) {
      buildPluginPackage(root, findPlugin(registry.plugins, targetId));
    }
  }

  return {
    ok: validation.errors.length === 0,
    checkedPluginIds: targetIds,
    errors: validation.errors,
    warnings: validation.warnings
  };
}

function resolveCheckTargets(
  plugins: PluginRegistryEntry[],
  pluginId: string | undefined,
  changedPluginIds: string[],
  options: CheckOptions
): string[] {
  if (pluginId) {
    findPlugin(plugins, pluginId);
    return [pluginId];
  }

  if (options.base) {
    return changedPluginIds;
  }

  return [];
}

function findPlugin(plugins: PluginRegistryEntry[], pluginId: string): PluginRegistryEntry {
  const plugin = plugins.find((entry) => entry.pluginId === pluginId);
  if (!plugin) {
    throw new Error(`Plugin not found in registry: ${pluginId}`);
  }
  return plugin;
}

function shouldPrompt(options: CommonOptions, context: PluginCliContext): boolean {
  return Boolean(
    options.interactive !== false && !options.yes && !options.json && (context.stdinIsTTY ?? process.stdin.isTTY)
  );
}

async function resolveValue(
  value: string | undefined,
  message: string,
  defaultValue: string | undefined,
  promptEnabled: boolean
): Promise<string | undefined> {
  if (value || !promptEnabled) {
    return value;
  }

  const answer = await input({ message, default: defaultValue });
  return answer.trim() || undefined;
}

function outputMode(options: { json?: boolean }): OutputMode {
  return options.json ? 'json' : 'human';
}

function writeOutput(stdout: (message: string) => void, mode: OutputMode, data: unknown, human: string): void {
  stdout(mode === 'json' ? JSON.stringify(data, null, 2) : human);
}

function runDoctor(root: string): DoctorCheck[] {
  return [
    checkCommand(root, 'git', ['--version'], true),
    checkCommand(root, 'gh', ['--version'], false),
    checkCommand(root, 'node', ['--version'], true),
    checkCommand(root, 'pnpm', ['--version'], true)
  ];
}

function checkCommand(root: string, name: string, args: string[], required: boolean): DoctorCheck {
  try {
    return {
      name,
      required,
      ok: true,
      version: execFileSync(name, args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
        .split(/\r?\n/)
        .find(Boolean)
        ?.trim() ?? null
    };
  } catch {
    return { name, required, ok: false, version: null };
  }
}

function formatDoctor(checks: DoctorCheck[]): string {
  return checks
    .map(
      (check) =>
        `${check.ok ? 'ok' : check.required ? 'missing' : 'optional-missing'} ${check.name}${
          check.version ? ` ${check.version}` : ''
        }`
    )
    .join('\n');
}

function formatCheckResult(result: { ok: boolean; checkedPluginIds: string[]; errors: string[]; warnings: string[] }): string {
  const lines = [result.ok ? 'ok' : 'failed'];
  if (result.checkedPluginIds.length > 0) {
    lines.push(`checked plugins: ${result.checkedPluginIds.join(', ')}`);
  }
  for (const warning of result.warnings) {
    lines.push(`warn: ${warning}`);
  }
  for (const error of result.errors) {
    lines.push(`error: ${error}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  await runPluginCli(process.argv.slice(2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
