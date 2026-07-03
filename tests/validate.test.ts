import { describe, expect, it } from 'vitest';

import { detectChangedPluginIds, findUnsupportedWorkspaceDependencySpecs } from '../scripts/validate.js';
import type { PluginRegistryEntry } from '../schemas/registry.js';

describe('detectChangedPluginIds', () => {
  const plugins: PluginRegistryEntry[] = [
    plugin('weatherTool', 'packages/tools/weatherTool'),
    plugin('searchTool', 'packages/tools/searchTool')
  ];

  it('returns no changed plugins when no diff range is provided', () => {
    expect(detectChangedPluginIds({ root: process.cwd(), plugins })).toEqual([]);
  });

  it('selects all plugins when registry semantics change', () => {
    const result = detectChangedPluginIds({
      root: process.cwd(),
      baseSha: 'HEAD',
      headSha: 'HEAD',
      plugins
    });

    expect(result).toEqual([]);
  });

  it('rejects catalog and workspace dependency specifiers in plugin packages', () => {
    expect(
      findUnsupportedWorkspaceDependencySpecs({
        dependencies: {
          '@fastgpt-plugin/sdk-factory': 'catalog:',
          local: 'workspace:*',
          zod: '^4.3.6'
        },
        devDependencies: {
          vitest: '^4.0.18'
        }
      })
    ).toEqual([
      'dependencies.@fastgpt-plugin/sdk-factory uses catalog:',
      'dependencies.local uses workspace:*'
    ]);
  });
});

function plugin(pluginId: string, submodule: string): PluginRegistryEntry {
  return {
    pluginId,
    version: '0.1.0',
    type: 'tool',
    source: `https://github.com/example/${pluginId}`,
    commit: 'abcdef1234567890',
    submodule,
    path: '.',
    status: 'pending',
    support: 'community'
  };
}
