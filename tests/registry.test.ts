import { describe, expect, it } from 'vitest';

import { parseRegistryJson, validateRegistryJson } from '../schemas/registry.js';

describe('registry schema', () => {
  it('parses a valid registry with a nested plugin path', () => {
    const registry = parseRegistryJson({
      version: 1,
      plugins: [
        {
          pluginId: 'weather-tool',
          version: '0.1.0',
          type: 'tool',
          source: 'https://github.com/example/weather-tool',
          commit: 'abcdef1234567890',
          submodule: 'plugins/weather-tool',
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
          validPlugin({ pluginId: 'weather-tool' }),
          validPlugin({ pluginId: 'weather-tool', version: '0.2.0' })
        ]
      })
    ).toThrow('duplicate pluginId');
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

  it('requires submodules to live under plugins/', () => {
    const issues = validateRegistryJson({
      version: 1,
      plugins: [validPlugin({ submodule: 'vendor/weather-tool' })]
    });

    expect(issues.map((issue) => issue.message)).toContain('must live under plugins/');
  });

  it('accepts lifecycle status and event pointers', () => {
    const registry = parseRegistryJson({
      version: 1,
      plugins: [
        validPlugin({
          status: 'revoked',
          review: 'reviews/weather-tool/0.1.0.json',
          latestPublishEvent: 'events/2026-06-29/weather-tool-0.1.0-published.json',
          latestRevokeEvent: 'events/2026-06-30/weather-tool-0.1.0-revoked.json'
        })
      ]
    });

    expect(registry.plugins[0]?.status).toBe('revoked');
    expect(registry.plugins[0]?.latestRevokeEvent).toContain('revoked.json');
  });
});

function validPlugin(overrides: Record<string, unknown> = {}) {
  return {
    pluginId: 'weather-tool',
    version: '0.1.0',
    type: 'tool',
    source: 'https://github.com/example/weather-tool',
    commit: 'abcdef1234567890',
    submodule: 'plugins/weather-tool',
    path: '.',
    ...overrides
  };
}
