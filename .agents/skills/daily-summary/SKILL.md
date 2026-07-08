---
name: daily-summary
description: Generate a human-readable daily FastGPT community plugin summary from committed publish and revoke events.
---

# FastGPT Community Plugin Daily Summary

Use this skill to summarize new and revoked FastGPT community plugins for a day.

The input source is repository state: committed lifecycle events under `events/<yyyy-mm-dd>/` and current `plugins.json`. Do not infer unpublished plugins from submodule changes alone.

## Preflight

Before reading repository data, update the local checkout to the latest committed state from its tracking branch:

1. Run `git status --short --branch` and identify the current branch and upstream.
2. Run `git fetch --all --prune`.
3. If the working tree is clean and the branch has an upstream, run `git pull --ff-only`.
4. If the checkout cannot be updated with a clean fast-forward, stop and report the blocker instead of producing a summary from stale local state.

## Required Inputs

- Date in `YYYY-MM-DD`, default to today in the operator's timezone.
- Optional output channel: Markdown file, issue/comment body, or chat message.

## Required Context

1. Complete the preflight update.
2. Read `schemas/event.ts`.
3. Read all `events/<date>/*.json` files for the target date.
4. Read `plugins.json` to enrich plugin metadata and current status.
5. Use the review summary embedded in each publish event.

## Output

Produce concise Markdown:

```markdown
# FastGPT Community Plugin Summary - 2026-06-29

## Newly Published

- `weatherTool` v0.1.0 — community-maintained tool. Review: pass. Marketplace release: mkt_123.

## Revoked

- `old-tool` v0.1.0 — revoked for `broken`: Fails current package check. New installs disabled.

## Notes

- Community plugins are reviewed for publishability and traceability. Ongoing maintenance belongs to plugin contributors unless otherwise stated.
```

## Rules

- Separate published and revoked events.
- Include plugin id, version, status, reason, marketplace release id when present, and one-line review summary when useful.
- Make the support boundary explicit: community plugin summaries are not official quality guarantees.
- If there are no events, output a short no-change summary.
