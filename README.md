# FastGPT Community Plugins

FastGPT Community Plugins is the trusted index and publishing automation for community-provided FastGPT plugins.

The first release focuses on an internal end-to-end loop:

```text
plugin repo / internal intake
        |
        v
plugins.json + plugins/<plugin-id> submodule
        |
        v
validate.yml
schema, submodule, source layout, hard policy gates
        |
        v
AI policy review
pass / warn / fail
        |
        v
publish.yml
.pkg upload + immutable publish receipt + publish event
        |
        v
daily-summary skill
human-readable publish/revoke digest
        |
        v
revoke.yml
repo-side revoke event + registry status update
```

## Repository Layout

```text
plugins.json                         # machine-readable registry
plugins/<plugin-id>/                 # git submodules
schemas/registry.ts                  # single registry contract
scripts/validate.ts                  # registry/submodule/policy hard gates
scripts/publish.ts                   # AI verdict gate, package upload, receipt generation
scripts/revoke.ts                    # repo-side revoke action and revoke event generation
events/<yyyy-mm-dd>/*.json           # publish/revoke lifecycle events
.agents/skills/plugin-discovery/SKILL.md          # internal intake helper spec
.agents/skills/plugin-review/SKILL.md             # AI publishability review spec
.agents/skills/daily-summary/SKILL.md             # AI daily summary spec
.agents/skills/develop-fastgpt-plugin/SKILL.md    # beginner plugin development guide
tests/                               # Vitest coverage for hard gates
.github/workflows/validate.yml       # PR validation
.github/workflows/publish.yml        # manual publish workflow
.github/workflows/revoke.yml         # manual repo-side revoke workflow
```

## Registry

`plugins.json` is the source of truth for indexed plugins:

```json
{
  "version": 1,
  "plugins": [
    {
      "pluginId": "weather-tool",
      "version": "0.1.0",
      "type": "tool",
      "source": "https://github.com/example/weather-tool",
      "commit": "abcdef1234567890",
      "submodule": "plugins/weather-tool",
      "path": ".",
      "status": "pending",
      "support": "community",
      "review": "reviews/weather-tool/0.1.0.json"
    }
  ]
}
```

Field rules live in `schemas/registry.ts`. Scripts and skills should depend on that schema instead of duplicating validation logic.

## Local Commands

```bash
pnpm install
pnpm test
pnpm run type-check
pnpm run validate
pnpm run publish -- --plugin <plugin-id> --review <ai-review.json> --dry-run --skip-build
pnpm run revoke -- --plugin <plugin-id> --reason broken --details "Fails current package check"
```

## Publishing Boundary

This repository performs intake, deterministic hard gates, Agent-assisted review, package upload, lifecycle event generation, daily summary support, and repo-side revoke state.

Community plugins are reviewed for publishability and traceability. They are not official FastGPT feature guarantees. Plugin source, ongoing availability, maintenance, and feature expansion stay with the plugin contributor unless explicitly stated otherwise.

`plugin-review` and `daily-summary` are AI skills. They read repository state and produce review or summary artifacts. Deterministic scripts remain responsible for schema validation, package checks, publish event writing, and revoke event writing.

`revoke` is currently a repository-side action: it marks the registry entry revoked and writes a revoke event. Marketplace-side revoke/hide APIs are intentionally left as an extension point; when those APIs exist, `scripts/revoke.ts` can attach that call before writing the final event.
