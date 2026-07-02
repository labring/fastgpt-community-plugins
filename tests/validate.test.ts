import { describe, expect, it } from 'vitest';

import { detectChangedPluginIds } from '../scripts/validate.js';
import type { PluginRegistryEntry } from '../schemas/registry.js';

describe('detectChangedPluginIds', () => {
  const plugins: PluginRegistryEntry[] = [
    plugin('weatherTool', 'plugins/weatherTool'),
    plugin('searchTool', 'plugins/searchTool')
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
