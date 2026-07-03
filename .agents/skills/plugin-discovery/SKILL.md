---
name: plugin-discovery
description: Internal FastGPT community plugin intake helper. Detects candidate plugin metadata and prepares registry intake notes for this repository.
---

# FastGPT Plugin Discovery

Use this skill for internal plugin onboarding only. It is not a public marketplace UI and it does not approve releases by itself.

## Goal

Given a candidate plugin repository or local path, produce a reviewable intake bundle:

- candidate `plugins.json` entry matching `schemas/registry.ts`
- suggested `git submodule add` command
- suggested `pnpm run plugin -- add --from packages/tools/<pluginId>` command
- detected plugin root path
- build/check/pack command plan
- hard-gate risk report
- AI policy review recommendation: `pass`, `warn`, or `fail`
- expected PR review comment content
- expected publish/revoke event evidence
- reviewer checklist

## Required Inputs

- Source repo URL or local path
- Desired `pluginId`
- Source commit SHA
- Optional nested plugin path, default `.`

## Output Contract

The registry patch must match the runtime schema in `schemas/registry.ts`. Do not copy field rules into this skill; read the schema before generating an entry.

Example:

```json
{
  "pluginId": "weatherTool",
  "version": "0.1.0",
  "type": "tool",
  "source": "https://github.com/example/weatherTool",
  "commit": "abcdef1234567890",
  "submodule": "packages/tools/weatherTool",
  "path": ".",
  "status": "pending",
  "support": "community"
}
```

Do not include a `review` field in registry entries. Review findings should be posted as GitHub PR comments. If publish automation needs a machine-readable verdict, pass it directly with `--review-verdict` and `--review-summary`. The JSON shape in `schemas/review.ts` is only for internal automation handoff:

```json
{
  "pluginId": "weatherTool",
  "version": "0.1.0",
  "verdict": "pass",
  "summary": "No blocking policy risks found.",
  "generatedAt": "2026-06-05T00:00:00.000Z"
}
```

## Hard Gates

Mark the intake as blocked if any of these are found:

- invalid registry entry
- missing `package.json`
- missing `index.ts`
- build/check/pack failure
- suspected secret or private key
- process execution through `child_process`
- destructive filesystem removal
- package checksum mismatch

## AI Policy Verdict

- `pass`: eligible for autonomous publish after deterministic gates pass
- `warn`: do not publish; place in periodic review queue
- `fail`: do not publish; require remediation

## Review Report Template

```markdown
## Plugin Review: <pluginId>@<version>

Source: <repo>
Commit: <sha>
Path: <path>
Verdict: pass | warn | fail

## Detected Plugin Shape
- package:
- entry:
- manifest:

## Hard Gates
- registry:
- source layout:
- build/check/pack:
- policy scan:

## AI Policy Review
- license:
- secrets:
- network:
- filesystem/process:
- dependency risk:

## GitHub Comment
- target PR:
- top-level comment posted:
- inline comments posted:

## Publish Evidence
- package:
- sha256:
- receipt:

## Reviewer Checklist
- [ ] Source repo and commit match registry
- [ ] Plugin repository has its own `packageManager` and `pnpm-lock.yaml`
- [ ] Plugin dependencies do not use `catalog:` or `workspace:`
- [ ] `.pkg` was rebuilt from pinned source
- [ ] Findings were posted to the GitHub PR when a PR exists
- [ ] Publish event contains package checksum and marketplace release id after publish
- [ ] Revoke action can mark the registry entry revoked and write a revoke event
```
