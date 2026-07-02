import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { publishPlugin } from '../scripts/publish.js';

const tempDirs: string[] = [];

describe('publishPlugin', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes an immutable dry-run receipt without changing registry state', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-community-publish-'));
    tempDirs.push(root);

    fs.mkdirSync(path.join(root, 'plugins', 'weatherTool'), { recursive: true });
    fs.writeFileSync(path.join(root, 'plugins', 'weatherTool', 'weatherTool.pkg'), 'pkg-content');
    fs.writeFileSync(path.join(root, 'ai-review.json'), reviewJson('pass'));
    fs.writeFileSync(
      path.join(root, 'plugins.json'),
      JSON.stringify({
        version: 1,
        plugins: [
          {
            pluginId: 'weatherTool',
            version: '0.1.0',
            type: 'tool',
            source: 'https://github.com/example/weatherTool',
            commit: 'abcdef1234567890',
            submodule: 'plugins/weatherTool',
            path: '.'
          }
        ]
      })
    );

    const receipt = await publishPlugin({
      root,
      registryPath: path.join(root, 'plugins.json'),
      pluginId: 'weatherTool',
      reviewPath: 'ai-review.json',
      receiptDir: 'dist/receipts',
      eventDir: 'events',
      actor: 'test-runner',
      dryRun: true,
      skipBuild: true
    });

    const receiptPath = path.join(
      root,
      'dist',
      'receipts',
      'weatherTool',
      '0.1.0',
      'publish-receipt.json'
    );

    expect(receipt.package.sha256).toHaveLength(64);
    expect(receipt.marketplace.uploaded).toBe(false);
    expect(receipt.review.aiVerdict).toBe('pass');
    expect(fs.existsSync(receiptPath)).toBe(true);
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'plugins.json'), 'utf8'));
    expect(registry.plugins[0].latestPublishEvent).toBeUndefined();
    expect(findEvent(root, 'published')).toBeUndefined();
  });

  it('writes a publish event and marks the registry active after upload', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-community-publish-'));
    tempDirs.push(root);

    fs.mkdirSync(path.join(root, 'plugins', 'weatherTool'), { recursive: true });
    fs.writeFileSync(path.join(root, 'plugins', 'weatherTool', 'weatherTool.pkg'), 'pkg-content');
    fs.writeFileSync(path.join(root, 'ai-review.json'), reviewJson('pass'));
    fs.writeFileSync(
      path.join(root, 'plugins.json'),
      JSON.stringify({
        version: 1,
        plugins: [
          {
            pluginId: 'weatherTool',
            version: '0.1.0',
            type: 'tool',
            source: 'https://github.com/example/weatherTool',
            commit: 'abcdef1234567890',
            submodule: 'plugins/weatherTool',
            path: '.'
          }
        ]
      })
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ releaseId: 'mkt_123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    process.env.MARKETPLACE_BASE_URL = 'https://marketplace.example.com';
    process.env.MARKETPLACE_AUTH = 'Bearer test';

    try {
      const receipt = await publishPlugin({
        root,
        registryPath: path.join(root, 'plugins.json'),
        pluginId: 'weatherTool',
        reviewPath: 'ai-review.json',
        receiptDir: 'dist/receipts',
        eventDir: 'events',
        actor: 'test-runner',
        dryRun: false,
        skipBuild: true
      });

      const registry = JSON.parse(fs.readFileSync(path.join(root, 'plugins.json'), 'utf8'));
      expect(receipt.marketplace.releaseId).toBe('mkt_123');
      expect(registry.plugins[0].status).toBe('active');
      expect(registry.plugins[0].latestPublishEvent).toContain('published.json');
      expect(findEvent(root, 'published')).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.MARKETPLACE_BASE_URL;
      delete process.env.MARKETPLACE_AUTH;
    }
  });

  it('keeps repeated publish events as separate files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-community-publish-'));
    tempDirs.push(root);

    fs.mkdirSync(path.join(root, 'plugins', 'weatherTool'), { recursive: true });
    fs.writeFileSync(path.join(root, 'plugins', 'weatherTool', 'weatherTool.pkg'), 'pkg-content');
    fs.writeFileSync(path.join(root, 'ai-review.json'), reviewJson('pass'));
    fs.writeFileSync(
      path.join(root, 'plugins.json'),
      JSON.stringify({
        version: 1,
        plugins: [
          {
            pluginId: 'weatherTool',
            version: '0.1.0',
            type: 'tool',
            source: 'https://github.com/example/weatherTool',
            commit: 'abcdef1234567890',
            submodule: 'plugins/weatherTool',
            path: '.'
          }
        ]
      })
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ releaseId: 'mkt_123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    process.env.MARKETPLACE_BASE_URL = 'https://marketplace.example.com';
    process.env.MARKETPLACE_AUTH = 'Bearer test';

    const options = {
      root,
      registryPath: path.join(root, 'plugins.json'),
      pluginId: 'weatherTool',
      reviewPath: 'ai-review.json',
      receiptDir: 'dist/receipts',
      eventDir: 'events',
      actor: 'test-runner',
      dryRun: false,
      skipBuild: true
    };

    try {
      await publishPlugin(options);
      const firstRegistry = JSON.parse(fs.readFileSync(path.join(root, 'plugins.json'), 'utf8'));
      const firstEventPath = firstRegistry.plugins[0].latestPublishEvent;
      await publishPlugin(options);
      const secondRegistry = JSON.parse(fs.readFileSync(path.join(root, 'plugins.json'), 'utf8'));
      const secondEventPath = secondRegistry.plugins[0].latestPublishEvent;

      expect(secondEventPath).not.toBe(firstEventPath);
      expect(fs.existsSync(path.join(root, firstEventPath))).toBe(true);
      expect(fs.existsSync(path.join(root, secondEventPath))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.MARKETPLACE_BASE_URL;
      delete process.env.MARKETPLACE_AUTH;
    }
  });

  it('discovers the only pkg file when its name differs from pluginId', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-community-publish-'));
    tempDirs.push(root);

    fs.mkdirSync(path.join(root, 'plugins', 'weatherTool', 'packages', 'tool'), { recursive: true });
    fs.writeFileSync(path.join(root, 'plugins', 'weatherTool', 'packages', 'tool', 'tool.pkg'), 'pkg-content');
    fs.writeFileSync(path.join(root, 'ai-review.json'), reviewJson('pass'));
    fs.writeFileSync(
      path.join(root, 'plugins.json'),
      JSON.stringify({
        version: 1,
        plugins: [
          {
            pluginId: 'weatherTool',
            version: '0.1.0',
            type: 'tool',
            source: 'https://github.com/example/weatherTool',
            commit: 'abcdef1234567890',
            submodule: 'plugins/weatherTool',
            path: 'packages/tool'
          }
        ]
      })
    );

    const receipt = await publishPlugin({
      root,
      registryPath: path.join(root, 'plugins.json'),
      pluginId: 'weatherTool',
      reviewPath: 'ai-review.json',
      receiptDir: 'dist/receipts',
      eventDir: 'events',
      actor: 'test-runner',
      dryRun: true,
      skipBuild: true
    });

    expect(receipt.package.file).toBe('tool.pkg');
  });

  it('blocks publish when AI review verdict is warn', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-community-publish-'));
    tempDirs.push(root);

    fs.mkdirSync(path.join(root, 'plugins', 'weatherTool'), { recursive: true });
    fs.writeFileSync(path.join(root, 'plugins', 'weatherTool', 'weatherTool.pkg'), 'pkg-content');
    fs.writeFileSync(path.join(root, 'ai-review.json'), reviewJson('warn'));
    fs.writeFileSync(
      path.join(root, 'plugins.json'),
      JSON.stringify({
        version: 1,
        plugins: [
          {
            pluginId: 'weatherTool',
            version: '0.1.0',
            type: 'tool',
            source: 'https://github.com/example/weatherTool',
            commit: 'abcdef1234567890',
            submodule: 'plugins/weatherTool',
            path: '.'
          }
        ]
      })
    );

    await expect(
      publishPlugin({
        root,
        registryPath: path.join(root, 'plugins.json'),
        pluginId: 'weatherTool',
        reviewPath: 'ai-review.json',
        receiptDir: 'dist/receipts',
        eventDir: 'events',
        actor: 'test-runner',
        dryRun: true,
        skipBuild: true
      })
    ).rejects.toThrow('AI review verdict is warn');
  });

  it('requires an AI review file for real publish', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-community-publish-'));
    tempDirs.push(root);

    fs.mkdirSync(path.join(root, 'plugins', 'weatherTool'), { recursive: true });
    fs.writeFileSync(path.join(root, 'plugins', 'weatherTool', 'weatherTool.pkg'), 'pkg-content');
    fs.writeFileSync(
      path.join(root, 'plugins.json'),
      JSON.stringify({
        version: 1,
        plugins: [
          {
            pluginId: 'weatherTool',
            version: '0.1.0',
            type: 'tool',
            source: 'https://github.com/example/weatherTool',
            commit: 'abcdef1234567890',
            submodule: 'plugins/weatherTool',
            path: '.'
          }
        ]
      })
    );

    await expect(
      publishPlugin({
        root,
        registryPath: path.join(root, 'plugins.json'),
        pluginId: 'weatherTool',
        receiptDir: 'dist/receipts',
        eventDir: 'events',
        actor: 'test-runner',
        dryRun: false,
        skipBuild: true
      })
    ).rejects.toThrow('--review is required for publish');
  });
});

function reviewJson(verdict: 'pass' | 'warn' | 'fail'): string {
  return JSON.stringify({
    pluginId: 'weatherTool',
    version: '0.1.0',
    verdict,
    summary: `fixture ${verdict}`,
    generatedAt: '2026-06-05T00:00:00.000Z'
  });
}

function findEvent(root: string, eventType: string): string | undefined {
  const eventsRoot = path.join(root, 'events');
  if (!fs.existsSync(eventsRoot)) return undefined;

  for (const day of fs.readdirSync(eventsRoot)) {
    const dir = path.join(eventsRoot, day);
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      if (fs.readFileSync(fullPath, 'utf8').includes(`"eventType": "${eventType}"`)) {
        return fullPath;
      }
    }
  }

  return undefined;
}
