---
name: daily-summary
description: Generate a human-readable daily FastGPT community plugin summary from committed publish and revoke events.
---

# FastGPT Community Plugin Daily Summary

Use this skill to summarize new and revoked FastGPT community plugins for a day.

The input source is repository state: committed lifecycle events under `events/<yyyy-mm-dd>/` and current `plugins.json`. Do not infer unpublished plugins from submodule changes alone.

## Required Inputs

- Date in `YYYY-MM-DD`, default to today in the operator's timezone.
- Optional output channel: Markdown file, issue/comment body, or chat message.

## Required Context

1. Read `schemas/event.ts`.
2. Read all `events/<date>/*.json` files for the target date.
3. Read `plugins.json` to enrich plugin metadata and current status.
4. Use the review summary embedded in each publish event.

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
