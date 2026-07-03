import { describe, expect, it } from 'vitest';

import { parseRegistryJson, validateRegistryJson } from '../schemas/registry.js';

describe('registry schema', () => {
  it('parses a valid registry with a nested plugin path', () => {
    const registry = parseRegistryJson({
      version: 1,
      plugins: [
        {
          pluginId: 'weatherTool',
          version: '0.1.0',
          type: 'tool',
          source: 'https://github.com/example/weatherTool',
          commit: 'abcdef1234567890',
          submodule: 'packages/tools/weatherTool',
          path: 'packages/tool'
        }
      ]
    });

    expect(registry.plugins[0]?.path).toBe('packages/tool');
    expect(registry.plugins[0]?.status).toBe('pending');
    expect(registry.plugins[0]?.support).toBe('community');
  });

  it('rejects duplicate plugin ids', () => {
    expect(() =>
      parseRegistryJson({
        version: 1,
        plugins: [
          validPlugin({ pluginId: 'weatherTool' }),
          validPlugin({ pluginId: 'weatherTool', version: '0.2.0' })
        ]
      })
    ).toThrow('duplicate pluginId');
  });

  it('requires lower camelCase plugin ids', () => {
    const issues = validateRegistryJson({
      version: 1,
      plugins: [validPlugin({ pluginId: 'weather-tool' })]
    });

    expect(issues.map((issue) => issue.message)).toContain('must use lower camelCase letters and numbers');
  });

  it('rejects absolute and parent-relative paths', () => {
    const absoluteIssues = validateRegistryJson({
      version: 1,
      plugins: [validPlugin({ path: '/tmp/plugin' })]
    });
    const parentIssues = validateRegistryJson({
      version: 1,
      plugins: [validPlugin({ path: '../plugin' })]
    });

    expect(absoluteIssues.map((issue) => issue.message)).toContain('must be a relative path');
    expect(parentIssues.map((issue) => issue.message)).toContain('must not contain .. segments');
  });

  it('requires submodules to live under packages/tools/', () => {
    const issues = validateRegistryJson({
      version: 1,
      plugins: [validPlugin({ submodule: 'vendor/weatherTool' })]
    });

    expect(issues.map((issue) => issue.message)).toContain('must live under packages/tools/');
  });

  it('accepts lifecycle status and event pointers', () => {
    const registry = parseRegistryJson({
      version: 1,
      plugins: [
        validPlugin({
          status: 'revoked',
          latestPublishEvent: 'events/2026-06-29/weatherTool-0.1.0-published.json',
          latestRevokeEvent: 'events/2026-06-30/weatherTool-0.1.0-revoked.json'
        })
      ]
    });

    expect(registry.plugins[0]?.status).toBe('revoked');
    expect(registry.plugins[0]?.latestRevokeEvent).toContain('revoked.json');
  });

  it('rejects review pointers in registry entries', () => {
    const issues = validateRegistryJson({
      version: 1,
      plugins: [
        validPlugin({
          review: 'reviews/weatherTool/0.1.0.json'
        })
      ]
    });

    expect(issues.some((issue) => issue.path === 'plugins.0' && issue.message.includes('review'))).toBe(true);
  });
});

function validPlugin(overrides: Record<string, unknown> = {}) {
  return {
    pluginId: 'weatherTool',
    version: '0.1.0',
    type: 'tool',
    source: 'https://github.com/example/weatherTool',
    commit: 'abcdef1234567890',
    submodule: 'packages/tools/weatherTool',
    path: '.',
    ...overrides
  };
}
