---
name: plugin-review
description: Review a FastGPT community plugin candidate and post a structured publishability verdict to the pull request.
---

# FastGPT Community Plugin Review

Use this skill when a candidate plugin PR, submodule, or local plugin path needs Agent review before publish.

This skill is advisory. It produces review evidence and a verdict for the repository workflow. It is not an official quality guarantee and does not make FastGPT responsible for ongoing plugin maintenance.

Review evidence belongs in the GitHub pull request discussion. Do not add review verdict JSON files to `plugins.json`, and do not require contributors to commit `reviews/<pluginId>/<version>.json`.

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
5. Locate the main plugin logo and any child-tool logo overrides, open or render every distinct image, and verify which assets the generated manifest and final package use. Child tools may reuse a main logo that has passed this inspection.
6. Use deterministic script output when available: `pnpm run validate`, build/check/pack logs, policy scan findings, and package checksum.

Do not approve a logo from its filename or existence alone. Inspect its visible content; for SVG files, inspect both the source and rendered result when possible. The plugin must have a deliberate, production-ready logo that identifies its own product, brand, or function.

## Verdict Rules

- `pass`: deterministic gates and the logo inspection pass, and no blocking policy risk is found.
- `warn`: deterministic gates pass but maintenance, license, dependency, network, or usability risk needs human review before publish.
- `fail`: deterministic gates or the logo inspection fail, source/commit mismatch exists, package cannot be built, or blocking policy risk is found.

Never use `pass` to mean the plugin is feature-complete, bug-free, or officially maintained.

## Output Contract

Post a GitHub PR comment with this structure:

```markdown
## Plugin Review: <pluginId>@<version>

Verdict: pass | warn | fail
Source: <repo>@<commit>
Plugin root: <submodule>/<path>

### Findings
- [P1] path:line - problem and required fix

### Evidence
- registry/submodule:
- install/build/check/pack:
- icon/assets: main=<path>, child overrides=<paths|none>, manifest=<reference>, package=<reference>, placeholder check=<pass|fail>
- policy scan:
- package sha256:

### Publish Decision
Proceed | Blocked | Needs human review
```

When the review is running in a PR and `gh` is available, post the comment:

```bash
gh pr comment <pr-number> --body-file <review-comment.md>
```

For specific plugin source issues, include exact file and line references in the comment. Use inline GitHub review comments only when the line is part of the PR diff and the API context is available; otherwise use the top-level PR comment.

If a publish workflow needs a machine-readable verdict, pass it directly:

```bash
pnpm run plugin -- publish <pluginId> --review-verdict pass --review-summary "<summary>"
```

The JSON shape in `schemas/review.ts` is still useful when another automation layer needs to exchange verdict data internally:

```json
{
  "pluginId": "weatherTool",
  "version": "0.1.0",
  "verdict": "pass",
  "summary": "Deterministic gates passed. No blocking policy risks found. Community-maintained plugin; no official quality warranty implied.",
  "generatedAt": "2026-06-29T00:00:00.000Z"
}
```

## Review Notes

In the PR comment, include:

- source repo and commit inspected
- plugin root path
- build/check/pack result
- main logo path, child-tool overrides, visual inspection result, and final manifest/package references
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
- missing, unreadable, malformed, or unrenderable main plugin logo
- main or child-tool logo missing from, or incorrectly referenced by, the generated manifest or final package
- the FastGPT plugin template's default question-mark logo, including recolored, resized, or otherwise superficial variants
- an obvious placeholder or temporary logo, such as a question mark, generic initial, stock placeholder, or image unrelated to the plugin's product, brand, or function
- suspected private key, token, or hardcoded secret
- process execution through `child_process`
- destructive filesystem removal
- package checksum mismatch
- unclear source ownership or license that blocks redistribution
