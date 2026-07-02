import { describe, expect, it } from 'vitest';

import { LifecycleEventSchema } from '../schemas/event.js';

describe('lifecycle event schema', () => {
  it('parses publish and revoke events', () => {
    const published = LifecycleEventSchema.parse({
      schemaVersion: 1,
      eventType: 'published',
      pluginId: 'weatherTool',
      version: '0.1.0',
      source: {
        repo: 'https://github.com/example/weatherTool',
        commit: 'abcdef1234567890',
        submodule: 'plugins/weatherTool',
        path: '.'
      },
      package: {
        file: 'weatherTool.pkg',
        sha256: 'a'.repeat(64),
        sizeBytes: 1
      },
      review: {
        verdict: 'pass',
        summary: 'No blocking risks found.',
        generatedAt: null
      },
      marketplace: {
        releaseId: null,
        uploaded: false,
        visibility: 'unknown'
      },
      actor: 'test-runner',
      createdAt: '2026-06-29T00:00:00.000Z'
    });

    const revoked = LifecycleEventSchema.parse({
      schemaVersion: 1,
      eventType: 'revoked',
      pluginId: 'weatherTool',
      version: '0.1.0',
      reason: 'broken',
      details: 'Fails current package check.',
      marketplace: {
        releaseId: 'mkt_123',
        visibility: 'hidden',
        newInstallsAllowed: false
      },
      actor: 'test-runner',
      createdAt: '2026-06-30T00:00:00.000Z'
    });

    expect(published.eventType).toBe('published');
    expect(revoked.eventType).toBe('revoked');
  });
});
