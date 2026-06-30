import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scanPluginPolicy } from '../scripts/policy.js';

const tempDirs: string[] = [];

describe('scanPluginPolicy', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes a safe source file with a license', () => {
    const root = fixture({
      'LICENSE': 'Apache-2.0',
      'index.ts': 'export default function run() { return "ok"; }'
    });

    expect(scanPluginPolicy(root)).toEqual({ errors: [], warnings: [] });
  });

  it('fails hardcoded secrets', () => {
    const root = fixture({
      'index.ts': 'const apiKey = "abcdefghijklmnopqrstuvwxyz123456";'
    });

    expect(scanPluginPolicy(root).errors.join('\n')).toContain('possible generic api key assignment');
  });

  it('fails dangerous process execution', () => {
    const root = fixture({
      'index.ts': 'import { execSync } from "node:child_process"; execSync("whoami");'
    });

    expect(scanPluginPolicy(root).errors.join('\n')).toContain('possible child_process execution');
  });

  it('fails destructive filesystem removal', () => {
    const root = fixture({
      'index.ts': 'import fs from "node:fs"; fs.rmSync("/tmp/example", { recursive: true });'
    });

    expect(scanPluginPolicy(root).errors.join('\n')).toContain('possible destructive filesystem removal');
  });
});

function fixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-policy-'));
  tempDirs.push(root);

  for (const [file, content] of Object.entries(files)) {
    const fullPath = path.join(root, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  return root;
}
