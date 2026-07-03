---
name: plugin-review
description: Review a FastGPT community plugin candidate and produce a structured publishability verdict for this registry.
---

# FastGPT Community Plugin Review

Use this skill when a candidate plugin PR, submodule, or local plugin path needs Agent review before publish.

This skill is advisory. It produces review evidence and a verdict for the repository workflow. It is not an official quality guarantee and does not make FastGPT responsible for ongoing plugin maintenance.

## Required Inputs

- `pluginId`
- version
- source repo URL
- source commit SHA
- submodule path, usually `packages/tools/<pluginId>`
- optional nested plugin path, default `.`

## Required Context

Before writing a verdict:

1. Read `schemas/registry.ts`, `schemas/review.ts`, and `schemas/event.ts`.
2. Read the candidate registry entry from `plugins.json`.
3. Inspect the pinned submodule path and nested plugin path.
4. Review `package.json`, `index.ts`, README, license, dependency list, and generated `.pkg` location if present.
5. Use deterministic script output when available: `pnpm run validate`, build/check/pack logs, policy scan findings, and package checksum.

## Verdict Rules

- `pass`: deterministic gates pass and no blocking policy risk is found.
- `warn`: deterministic gates pass but maintenance, license, dependency, network, or usability risk needs human review before publish.
- `fail`: deterministic gates fail, source/commit mismatch exists, package cannot be built, or blocking policy risk is found.

Never use `pass` to mean the plugin is feature-complete, bug-free, or officially maintained.

## Output Contract

Write a JSON file that matches `schemas/review.ts`, typically:

```json
{
  "pluginId": "weatherTool",
  "version": "0.1.0",
  "verdict": "pass",
  "summary": "Deterministic gates passed. No blocking policy risks found. Community-maintained plugin; no official quality warranty implied.",
  "generatedAt": "2026-06-29T00:00:00.000Z"
}
```

Recommended path:

```text
reviews/<pluginId>/<version>.json
```

## Review Notes

In the summary or accompanying PR comment, include:

- source repo and commit inspected
- plugin root path
- build/check/pack result
- policy scan result
- secrets/process/filesystem/network concerns
- dependency or license concerns
- whether publish should proceed

## Hard Blocks

Mark as `fail` when any of these are present:

- invalid registry entry
- missing submodule or commit mismatch
- missing `package.json` or `index.ts`
- missing plugin-local `pnpm-lock.yaml`
- `catalog:` or `workspace:` dependency specifiers in plugin `package.json`
- build/check/pack failure
- suspected private key, token, or hardcoded secret
- process execution through `child_process`
- destructive filesystem removal
- package checksum mismatch
- unclear source ownership or license that blocks redistribution
