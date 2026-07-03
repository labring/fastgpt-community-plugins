import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { normalizeGitRemoteUrl } from '../scripts/registry.js';
import { runPluginCli } from '../scripts/plugin.js';

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
            support: 'community',
            review: 'reviews/googleSheets/0.1.0.json'
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
      version: '0.2.0',
      review: 'reviews/googleSheets/0.2.0.json'
    });
  });

  it('normalizes GitHub SSH remotes to registry-compatible URLs', () => {
    expect(normalizeGitRemoteUrl('git@github.com:labring/google-sheets.git')).toBe(
      'https://github.com/labring/google-sheets'
    );
    expect(normalizeGitRemoteUrl('ssh://git@github.com/labring/google-sheets.git')).toBe(
      'https://github.com/labring/google-sheets'
    );
  });
});
