import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { normalizeGitRemoteUrl } from '../scripts/registry.js';
import {
  resolveAutomatedPublishTargets,
  runPluginCli,
  selectPendingPublishPluginIds
} from '../scripts/plugin.js';
import type { PluginRegistryEntry } from '../schemas/registry.js';

const tempDirs: string[] = [];

describe('plugin CLI', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds a registry entry through the unified CLI', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-plugin-cli-'));
    tempDirs.push(root);
    fs.writeFileSync(path.join(root, 'plugins.json'), JSON.stringify({ version: 1, plugins: [] }));
    const output: string[] = [];

    await runPluginCli(
      [
        'add',
        '--plugin',
        'googleSheets',
        '--version',
        '0.1.0',
        '--source',
        'https://github.com/example/googleSheets',
        '--commit',
        'abcdef1234567890',
        '--json'
      ],
      {
        root,
        stdout: (message) => output.push(message),
        stdinIsTTY: false
      }
    );

    const result = JSON.parse(output[0] ?? '{}');
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'plugins.json'), 'utf8'));
    expect(result.action).toBe('created');
    expect(registry.plugins[0]).toMatchObject({
      pluginId: 'googleSheets',
      source: 'https://github.com/example/googleSheets',
      commit: 'abcdef1234567890'
    });
  });

  it('accepts pnpm run argument separators', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-plugin-cli-'));
    tempDirs.push(root);
    fs.writeFileSync(path.join(root, 'plugins.json'), JSON.stringify({ version: 1, plugins: [] }));
    const output: string[] = [];

    await runPluginCli(['--', 'check', '--json'], {
      root,
      stdout: (message) => output.push(message),
      stdinIsTTY: false
    });

    expect(JSON.parse(output[0] ?? '{}')).toMatchObject({
      ok: true,
      checkedPluginIds: []
    });
  });

  it('syncs version metadata from the pinned submodule path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-plugin-cli-'));
    tempDirs.push(root);
    const pluginRoot = path.join(root, 'packages', 'tools', 'googleSheets');
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, 'package.json'),
      JSON.stringify({
        name: '@fastgpt-plugin/google-sheets',
        version: '0.2.0'
      })
    );
    fs.writeFileSync(
      path.join(root, 'plugins.json'),
      JSON.stringify({
        version: 1,
        plugins: [
          {
            pluginId: 'googleSheets',
            version: '0.1.0',
            type: 'tool',
            source: 'https://github.com/example/googleSheets',
            commit: 'abcdef1234567890',
            submodule: 'packages/tools/googleSheets',
            path: '.',
            status: 'pending',
            support: 'community'
          }
        ]
      })
    );

    await runPluginCli(['sync', 'googleSheets', '--json'], {
      root,
      stdout: () => undefined,
      stdinIsTTY: false
    });

    const registry = JSON.parse(fs.readFileSync(path.join(root, 'plugins.json'), 'utf8'));
    expect(registry.plugins[0]).toMatchObject({
      pluginId: 'googleSheets',
      version: '0.2.0'
    });
    expect(registry.plugins[0]).not.toHaveProperty('review');
  });

  it('normalizes GitHub SSH remotes to registry-compatible URLs', () => {
    expect(normalizeGitRemoteUrl('git@github.com:labring/google-sheets.git')).toBe(
      'https://github.com/labring/google-sheets'
    );
    expect(normalizeGitRemoteUrl('ssh://git@github.com/labring/google-sheets.git')).toBe(
      'https://github.com/labring/google-sheets'
    );
  });

  it('selects only changed pending plugins for automated publish', () => {
    const plugins: PluginRegistryEntry[] = [
      plugin('googleSheets', 'pending'),
      plugin('weatherTool', 'active'),
      plugin('searchTool', 'revoked')
    ];

    expect(selectPendingPublishPluginIds(plugins, ['googleSheets', 'weatherTool', 'searchTool', 'removedTool'])).toEqual([
      'googleSheets'
    ]);
  });

  it('keeps legacy all-pending output when active reconciliation is disabled', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-plugin-cli-'));
    tempDirs.push(root);
    fs.writeFileSync(
      path.join(root, 'plugins.json'),
      JSON.stringify({ version: 1, plugins: [plugin('weatherTool', 'active')] })
    );
    const jsonOutput: string[] = [];
    const humanOutput: string[] = [];

    await runPluginCli(['publish-pending', '--all-pending', '--json'], {
      root,
      stdout: (message) => jsonOutput.push(message),
      stdinIsTTY: false
    });
    await runPluginCli(['publish-pending', '--all-pending'], {
      root,
      stdout: (message) => humanOutput.push(message),
      stdinIsTTY: false
    });

    expect(JSON.parse(jsonOutput[0] ?? '{}')).toMatchObject({
      republishPluginIds: [],
      publishPluginIds: [],
      skipped: [{ pluginId: 'weatherTool', reason: 'active plugins are not published automatically' }],
      published: []
    });
    expect(humanOutput).toEqual(['no pending changed plugins to publish']);
  });

  it('republishes active plugins only when their registry revision differs from the latest publish event', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-plugin-cli-'));
    tempDirs.push(root);
    const staleEventPath = 'events/2026-07-13/weatherTool-0.1.0-published.json';
    const currentEventPath = 'events/2026-07-13/searchTool-0.1.0-published.json';
    const plugins = [
      plugin('weatherTool', 'active', {
        commit: 'bbbbbbbbbbbbbbbb',
        latestPublishEvent: staleEventPath
      }),
      plugin('searchTool', 'active', {
        commit: 'cccccccccccccccc',
        latestPublishEvent: currentEventPath
      })
    ];
    writePublishEvent(root, staleEventPath, plugins[0]!, 'aaaaaaaaaaaaaaaa');
    writePublishEvent(root, currentEventPath, plugins[1]!, 'cccccccccccccccc');

    expect(resolveAutomatedPublishTargets(root, plugins, ['weatherTool', 'searchTool'])).toEqual({
      pendingPluginIds: [],
      republishPluginIds: [],
      publishPluginIds: []
    });
    expect(
      resolveAutomatedPublishTargets(root, plugins, ['weatherTool', 'searchTool'], { reconcileActive: true })
    ).toEqual({
      pendingPluginIds: [],
      republishPluginIds: ['weatherTool'],
      publishPluginIds: ['weatherTool']
    });
  });

  it('fails closed when an active plugin latest publish event cannot be parsed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-plugin-cli-'));
    tempDirs.push(root);
    const eventPath = 'events/2026-07-13/weatherTool-0.1.0-published.json';
    const pluginEntry = plugin('weatherTool', 'active', { latestPublishEvent: eventPath });
    const absolutePath = path.join(root, eventPath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, '{ invalid json');

    expect(() =>
      resolveAutomatedPublishTargets(root, [pluginEntry], ['weatherTool'], { reconcileActive: true })
    ).toThrow(`weatherTool: unable to read latest publish event ${eventPath}`);
  });

  it('fails closed when latestPublishEvent belongs to another plugin', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-plugin-cli-'));
    tempDirs.push(root);
    const eventPath = 'events/2026-07-13/weatherTool-0.1.0-published.json';
    const pluginEntry = plugin('weatherTool', 'active', { latestPublishEvent: eventPath });
    const otherPlugin = plugin('searchTool', 'active');
    writePublishEvent(root, eventPath, otherPlugin, otherPlugin.commit);

    expect(() =>
      resolveAutomatedPublishTargets(root, [pluginEntry], ['weatherTool'], { reconcileActive: true })
    ).toThrow(`weatherTool: latest publish event ${eventPath} belongs to searchTool`);
  });
});

function plugin(
  pluginId: string,
  status: PluginRegistryEntry['status'],
  overrides: Partial<PluginRegistryEntry> = {}
): PluginRegistryEntry {
  return {
    pluginId,
    version: '0.1.0',
    type: 'tool',
    source: `https://github.com/example/${pluginId}`,
    commit: 'abcdef1234567890',
    submodule: `packages/tools/${pluginId}`,
    path: '.',
    status,
    support: 'community',
    ...overrides
  };
}

function writePublishEvent(
  root: string,
  eventPath: string,
  pluginEntry: PluginRegistryEntry,
  commit: string
): void {
  const absolutePath = path.join(root, eventPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(
    absolutePath,
    JSON.stringify({
      schemaVersion: 1,
      eventType: 'published',
      pluginId: pluginEntry.pluginId,
      version: pluginEntry.version,
      source: {
        repo: pluginEntry.source,
        commit,
        submodule: pluginEntry.submodule,
        path: pluginEntry.path
      },
      package: {
        file: `${pluginEntry.pluginId}.pkg`,
        sha256: 'a'.repeat(64),
        sizeBytes: 1
      },
      review: {
        verdict: 'pass',
        summary: 'fixture pass',
        generatedAt: null
      },
      marketplace: {
        releaseId: null,
        uploaded: true,
        visibility: 'listed'
      },
      actor: 'test-runner',
      createdAt: '2026-07-13T00:00:00.000Z'
    })
  );
}
