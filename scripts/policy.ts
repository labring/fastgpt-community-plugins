import fs from 'node:fs';
import path from 'node:path';

export type PolicyScanResult = {
  errors: string[];
  warnings: string[];
};

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'generic api key assignment', pattern: /\b(?:api[_-]?key|secret|token)\b\s*[:=]\s*['"][A-Za-z0-9_\-]{24,}['"]/i }
];

const DANGEROUS_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'child_process execution', pattern: /\b(?:exec|execSync|spawn|spawnSync)\s*\(/ },
  { name: 'destructive filesystem removal', pattern: /\bfs\.(?:rm|rmSync|rmdir|rmdirSync)\s*\(/ },
  { name: 'shell command construction', pattern: /\b(?:sh|bash|zsh)\s+-c\b/ }
];

export function scanPluginPolicy(pluginRoot: string): PolicyScanResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const files = collectSourceFiles(pluginRoot);

  if (!fs.existsSync(path.join(pluginRoot, 'LICENSE'))) {
    warnings.push('LICENSE is recommended before autonomous publish');
  }

  for (const file of files) {
    const relative = path.relative(pluginRoot, file);
    const source = fs.readFileSync(file, 'utf8');

    for (const secret of SECRET_PATTERNS) {
      if (secret.pattern.test(source)) {
        errors.push(`${relative}: possible ${secret.name}`);
      }
    }

    for (const dangerous of DANGEROUS_PATTERNS) {
      if (dangerous.pattern.test(source)) {
        errors.push(`${relative}: possible ${dangerous.name}`);
      }
    }
  }

  return { errors, warnings };
}

function collectSourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.git')) {
      continue;
    }

    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files.sort();
}
