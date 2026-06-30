import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { PublishEventSchema, type PublishEvent } from '../schemas/event.js';
import {
  PluginRegistrySchema,
  readRegistryFile,
  resolvePluginRoot,
  type PluginRegistry,
  type PluginRegistryEntry
} from '../schemas/registry.js';
import { readAiReviewVerdict, type AiReviewVerdict } from '../schemas/review.js';

export type PublishOptions = {
  root: string;
  registryPath: string;
  pluginId: string;
  packagePath?: string;
  reviewPath?: string;
  receiptDir: string;
  eventDir: string;
  actor: string;
  dryRun: boolean;
  skipBuild: boolean;
};

export type PublishReceipt = {
  schemaVersion: 1;
  pluginId: string;
  version: string;
  source: {
    repo: string;
    commit: string;
    submodule: string;
    path: string;
  };
  package: {
    file: string;
    sha256: string;
    sizeBytes: number;
  };
  marketplace: {
    releaseId: string | null;
    uploaded: boolean;
  };
  review: {
    aiVerdict: 'pass';
    summary: string;
    generatedAt: string | null;
  };
  publishedAt: string;
};

type ResolvedAiReview = AiReviewVerdict & { reviewFile?: string };
type PublishableAiReview = ResolvedAiReview & { verdict: 'pass' };

export async function publishPlugin(options: PublishOptions): Promise<PublishReceipt> {
  const registry = readRegistryFile(options.registryPath);
  const plugin = registry.plugins.find((entry) => entry.pluginId === options.pluginId);

  if (!plugin) {
    throw new Error(`Plugin not found in registry: ${options.pluginId}`);
  }

  const aiReview = resolvePublishableAiReview(options.root, plugin, options.reviewPath, options.dryRun);

  if (!options.skipBuild) {
    buildPluginPackage(options.root, plugin);
  }

  const pkgPath = resolvePackagePath(options.root, plugin, options.packagePath);
  const stat = fs.statSync(pkgPath);
  const release = options.dryRun ? { uploaded: false, releaseId: null } : await uploadPackage(pkgPath);
  const publishedAt = new Date().toISOString();
  const receipt: PublishReceipt = {
    schemaVersion: 1,
    pluginId: plugin.pluginId,
    version: plugin.version,
    source: {
      repo: plugin.source,
      commit: plugin.commit,
      submodule: plugin.submodule,
      path: plugin.path
    },
    package: {
      file: path.basename(pkgPath),
      sha256: sha256File(pkgPath),
      sizeBytes: stat.size
    },
    marketplace: release,
    review: {
      aiVerdict: aiReview.verdict,
      summary: aiReview.summary,
      generatedAt: aiReview.generatedAt ?? null
    },
    publishedAt
  };

  writeReceipt(options.root, options.receiptDir, receipt);
  if (options.dryRun) {
    return receipt;
  }

  const eventPath = writePublishEvent(options.root, options.eventDir, {
    schemaVersion: 1,
    eventType: 'published',
    pluginId: plugin.pluginId,
    version: plugin.version,
    source: {
      repo: plugin.source,
      commit: plugin.commit,
      submodule: plugin.submodule,
      path: plugin.path
    },
    package: receipt.package,
    review: {
      verdict: 'pass',
      reviewFile: aiReview.reviewFile,
      summary: aiReview.summary,
      generatedAt: aiReview.generatedAt ?? null
    },
    marketplace: {
      releaseId: release.releaseId,
      uploaded: release.uploaded,
      visibility: release.uploaded ? 'listed' : 'unknown'
    },
    actor: options.actor,
    createdAt: publishedAt
  });
  plugin.status = 'active';
  plugin.latestPublishEvent = path.relative(options.root, eventPath).split(path.sep).join('/');
  writeRegistryFile(options.registryPath, registry);
  return receipt;
}

function resolveAiReview(
  root: string,
  plugin: PluginRegistryEntry,
  reviewPath: string | undefined,
  allowDefaultReview: boolean
): ResolvedAiReview {
  if (reviewPath) {
    const absolutePath = path.resolve(root, reviewPath);
    return {
      ...readAiReviewVerdict(absolutePath),
      reviewFile: toRepositoryRelativePath(root, absolutePath, 'review path')
    };
  }

  if (!allowDefaultReview) {
    throw new Error(`${plugin.pluginId}: --review is required for publish`);
  }

  return {
    pluginId: plugin.pluginId,
    version: plugin.version,
    verdict: 'pass',
    summary: 'No AI review file provided; allowed only for explicit dry-run or early internal bootstrap.'
  };
}

function resolvePublishableAiReview(
  root: string,
  plugin: PluginRegistryEntry,
  reviewPath: string | undefined,
  allowDefaultReview: boolean
): PublishableAiReview {
  const review = resolveAiReview(root, plugin, reviewPath, allowDefaultReview);
  assertPublishableAiReview(plugin, review);
  return review;
}

function assertPublishableAiReview(
  plugin: PluginRegistryEntry,
  review: AiReviewVerdict
): asserts review is PublishableAiReview {
  if (review.pluginId !== plugin.pluginId || review.version !== plugin.version) {
    throw new Error(
      `${plugin.pluginId}: AI review targets ${review.pluginId}@${review.version}, expected ${plugin.pluginId}@${plugin.version}`
    );
  }

  if (review.verdict !== 'pass') {
    throw new Error(`${plugin.pluginId}: AI review verdict is ${review.verdict}; publish is blocked`);
  }
}

function buildPluginPackage(root: string, plugin: PluginRegistryEntry): void {
  const pluginRoot = resolvePluginRoot(root, plugin);
  runPnpm(['--dir', pluginRoot, 'run', 'build'], root);
  runPnpm(['--dir', pluginRoot, 'run', 'pack'], root);
}

function runPnpm(args: string[], cwd: string): void {
  execFileSync('pnpm', args, {
    cwd,
    stdio: 'inherit'
  });
}

function resolvePackagePath(root: string, plugin: PluginRegistryEntry, packagePath?: string): string {
  if (packagePath) {
    return path.resolve(root, packagePath);
  }

  const pluginRoot = resolvePluginRoot(root, plugin);
  const expectedPath = path.join(pluginRoot, `${plugin.pluginId}.pkg`);
  if (fs.existsSync(expectedPath)) {
    return expectedPath;
  }

  const pkgFiles = fs
    .readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.pkg'))
    .map((entry) => path.join(pluginRoot, entry.name))
    .sort((a, b) => a.localeCompare(b));

  if (pkgFiles.length === 1) {
    return pkgFiles[0] as string;
  }

  if (pkgFiles.length > 1) {
    throw new Error(
      `${plugin.pluginId}: multiple .pkg files found in ${path.relative(root, pluginRoot)}; pass --package explicitly`
    );
  }

  return expectedPath;
}

async function uploadPackage(pkgPath: string): Promise<{ uploaded: boolean; releaseId: string | null }> {
  const baseUrl = requiredEnv('MARKETPLACE_BASE_URL').replace(/\/+$/, '');
  const auth = requiredEnv('MARKETPLACE_AUTH');
  const uploadUrl = `${baseUrl}/api/admin/pkg/upload`;
  const fileBuffer = await fs.promises.readFile(pkgPath);
  const formData = new FormData();

  formData.append('file', new Blob([fileBuffer], { type: 'application/octet-stream' }), path.basename(pkgPath));

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: auth
    },
    body: formData
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(`Marketplace upload failed (${response.status}): ${JSON.stringify(body)}`);
  }

  return {
    uploaded: true,
    releaseId: extractReleaseId(body)
  };
}

function writeReceipt(root: string, receiptDir: string, receipt: PublishReceipt): void {
  const dir = path.resolve(root, receiptDir, receipt.pluginId, receipt.version);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'publish-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}

function writePublishEvent(root: string, eventDir: string, event: PublishEvent): string {
  const parsed = PublishEventSchema.parse(event);
  const dir = path.resolve(root, eventDir, event.createdAt.slice(0, 10));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = resolveUniqueEventPath(dir, `${event.pluginId}-${event.version}-${eventTimestamp(event)}-published`);
  fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return filePath;
}

function writeRegistryFile(registryPath: string, registry: PluginRegistry): void {
  const parsed = PluginRegistrySchema.parse(registry);
  fs.writeFileSync(registryPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

function toRepositoryRelativePath(root: string, filePath: string, label: string): string {
  const relativePath = path.relative(root, filePath).split(path.sep).join('/');
  if (!relativePath || relativePath.startsWith('../') || relativePath === '..' || path.isAbsolute(relativePath)) {
    throw new Error(`${label} must be inside the repository: ${filePath}`);
  }

  return relativePath;
}

function eventTimestamp(event: Pick<PublishEvent, 'createdAt'>): string {
  return event.createdAt.replace(/\D/g, '');
}

function resolveUniqueEventPath(dir: string, basename: string): string {
  let filePath = path.join(dir, `${basename}.json`);
  for (let index = 2; fs.existsSync(filePath); index += 1) {
    filePath = path.join(dir, `${basename}-${index}.json`);
  }

  return filePath;
}

function sha256File(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return '';

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractReleaseId(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as Record<string, unknown>;
  const candidates = [record.releaseId, record.id, record.pluginReleaseId];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  return null;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const args = new Map<string, string | boolean>();

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--') {
      continue;
    }

    if (arg === '--dry-run') {
      args.set('dryRun', true);
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

  const pluginId = args.get('plugin');
  if (typeof pluginId !== 'string') {
    throw new Error('Usage: pnpm publish -- --plugin <plugin-id> [--package <path>] [--dry-run]');
  }

  const receipt = await publishPlugin({
    root,
    registryPath: path.resolve(root, String(args.get('registry') ?? 'plugins.json')),
    pluginId,
    packagePath: typeof args.get('package') === 'string' ? String(args.get('package')) : undefined,
    reviewPath: typeof args.get('review') === 'string' ? String(args.get('review')) : undefined,
    receiptDir: String(args.get('receipt-dir') ?? 'dist/receipts'),
    eventDir: String(args.get('event-dir') ?? 'events'),
    actor: String(args.get('actor') ?? process.env.GITHUB_ACTOR ?? 'local'),
    dryRun: Boolean(args.get('dryRun')),
    skipBuild: Boolean(args.get('skipBuild'))
  });

  console.log(JSON.stringify(receipt, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
