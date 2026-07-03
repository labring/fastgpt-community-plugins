import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { pluginIdFromPackageName, upsertRegistryEntry } from '../scripts/registry.js';

const tempDirs: string[] = [];

describe('registry CLI helpers', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('derives lower camelCase plugin ids from package names', () => {
    expect(pluginIdFromPackageName('@fastgpt-plugin/google-sheets')).toBe('googleSheets');
    expect(pluginIdFromPackageName('fastgpt-tools-feishu-bitable')).toBe('feishuBitable');
    expect(pluginIdFromPackageName('googleSheets')).toBe('googleSheets');
  });

  it('creates a registry entry from explicit metadata', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-community-registry-'));
    tempDirs.push(root);
    const registryPath = path.join(root, 'plugins.json');
    fs.writeFileSync(registryPath, JSON.stringify({ version: 1, plugins: [] }));

    const result = upsertRegistryEntry({
      root,
      registryPath,
      pluginId: 'googleSheets',
      version: '0.1.0',
      source: 'https://github.com/example/googleSheets',
      commit: 'abcdef1234567890',
      dryRun: false
    });

    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    expect(result.action).toBe('created');
    expect(result.entry).not.toHaveProperty('review');
    expect(result.submoduleCommand).toContain('packages/tools/googleSheets');
    expect(registry.plugins[0]).toMatchObject({
      pluginId: 'googleSheets',
      submodule: 'packages/tools/googleSheets',
      status: 'pending',
      support: 'community'
    });
  });

  it('infers plugin id and version from a local plugin package', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-community-registry-'));
    tempDirs.push(root);
    const registryPath = path.join(root, 'plugins.json');
    const pluginRoot = path.join(root, 'packages', 'tools', 'googleSheets');
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify({ version: 1, plugins: [] }));
    fs.writeFileSync(
      path.join(pluginRoot, 'package.json'),
      JSON.stringify({
        name: '@fastgpt-plugin/google-sheets',
        version: '0.1.0'
      })
    );

    const result = upsertRegistryEntry({
      root,
      registryPath,
      from: 'packages/tools/googleSheets',
      source: 'https://github.com/example/googleSheets',
      commit: 'abcdef1234567890',
      dryRun: false
    });

    expect(result.entry).toMatchObject({
      pluginId: 'googleSheets',
      version: '0.1.0',
      submodule: 'packages/tools/googleSheets',
      path: '.',
      support: 'community'
    });
    expect(result.submoduleCommand).toBeUndefined();
  });
});
