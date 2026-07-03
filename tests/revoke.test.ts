import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { revokePlugin } from '../scripts/revoke.js';

const tempDirs: string[] = [];

describe('revokePlugin', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks the registry entry revoked and writes a revoke event', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-community-revoke-'));
    tempDirs.push(root);
    const registryPath = path.join(root, 'plugins.json');
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        version: 1,
        plugins: [
          {
            pluginId: 'weatherTool',
            version: '0.1.0',
            type: 'tool',
            source: 'https://github.com/example/weatherTool',
            commit: 'abcdef1234567890',
            submodule: 'packages/tools/weatherTool',
            path: '.',
            status: 'active'
          }
        ]
      })
    );

    const event = revokePlugin({
      root,
      registryPath,
      pluginId: 'weatherTool',
      reason: 'broken',
      details: 'Fails current package check.',
      eventDir: 'events',
      actor: 'test-runner',
      marketplaceReleaseId: 'mkt_123'
    });

    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    expect(event.eventType).toBe('revoked');
    expect(event.marketplace.newInstallsAllowed).toBe(false);
    expect(registry.plugins[0].status).toBe('revoked');
    expect(registry.plugins[0].latestRevokeEvent).toContain('revoked.json');
    expect(fs.existsSync(path.join(root, registry.plugins[0].latestRevokeEvent))).toBe(true);
  });

  it('keeps repeated revoke events as separate files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-community-revoke-'));
    tempDirs.push(root);
    const registryPath = path.join(root, 'plugins.json');
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        version: 1,
        plugins: [
          {
            pluginId: 'weatherTool',
            version: '0.1.0',
            type: 'tool',
            source: 'https://github.com/example/weatherTool',
            commit: 'abcdef1234567890',
            submodule: 'packages/tools/weatherTool',
            path: '.',
            status: 'active'
          }
        ]
      })
    );

    const options = {
      root,
      registryPath,
      pluginId: 'weatherTool',
      reason: 'broken' as const,
      details: 'Fails current package check.',
      eventDir: 'events',
      actor: 'test-runner'
    };

    revokePlugin(options);
    const firstRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const firstEventPath = firstRegistry.plugins[0].latestRevokeEvent;
    revokePlugin(options);
    const secondRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const secondEventPath = secondRegistry.plugins[0].latestRevokeEvent;

    expect(secondEventPath).not.toBe(firstEventPath);
    expect(fs.existsSync(path.join(root, firstEventPath))).toBe(true);
    expect(fs.existsSync(path.join(root, secondEventPath))).toBe(true);
  });
});
