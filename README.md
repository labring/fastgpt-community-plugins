<div align="center">
<a href="https://tryfastgpt.ai/"><img src="https://github.com/labring/FastGPT/raw/main/.github/imgs/logo.svg" width="120" height="120" alt="fastgpt logo"></a>

# FastGPT Community Plugins

<p align="center">
  <a href="./README_zh_CN.md">简体中文</a> |
  <a href="./README.md">English</a>
</p>

[FastGPT](https://github.com/labring/FastGPT) community plugin registry and publishing automation.

This repository indexes community-provided FastGPT plugins, runs deterministic validation, keeps Agent-assisted review evidence, writes publish/revoke lifecycle events, and provides the workflow entry point for publishing approved community plugins to FastGPT Marketplace.
</div>

## Repository Scope

- Maintain a lightweight registry of community plugin references in `plugins.json`.
- Store each plugin as a pinned git submodule under `packages/tools/<pluginId>`.
- Use lower camelCase plugin ids, for example `googleSheets`.
- Run schema, submodule, source layout, and policy gates before publish.
- Use AI skills for plugin intake review and daily publish/revoke summaries.
- Publish approved `.pkg` artifacts through GitHub Actions.
- Record repository-side lifecycle state for publish and revoke actions.

Community plugins are reviewed for publishability and traceability. The review scope focuses on publish intake and audit evidence. Plugin source, ongoing availability, maintenance, and feature expansion stay with the plugin contributor unless explicitly stated otherwise.

## Directory Structure

```text
.
├── .agents/skills/
│   ├── develop-fastgpt-plugin/     # Beginner FastGPT plugin development guide
│   ├── plugin-discovery/           # Candidate intake helper
│   ├── plugin-review/              # AI publishability review skill
│   └── daily-summary/              # AI daily lifecycle summary skill
├── .github/workflows/
│   ├── validate.yml                # PR and manual registry validation
│   ├── publish.yml                 # Manual publish workflow
│   └── revoke.yml                  # Manual repository-side revoke workflow
├── events/<yyyy-mm-dd>/            # Committed publish/revoke lifecycle events
├── packages/tools/<pluginId>/      # Community plugin submodules
├── reviews/<pluginId>/             # AI review verdict artifacts
├── schemas/                        # Registry, review, and lifecycle event contracts
├── scripts/                        # Validation, publish, revoke, and policy gates
├── tests/                          # Vitest coverage for deterministic gates
├── plugins.json                    # Machine-readable community plugin registry
├── package.json                    # Root scripts and toolchain versions
├── pnpm-workspace.yaml             # Root toolchain catalog; plugin submodules are excluded
└── turbo.json                      # Task orchestration
```

## Registry Contract

`plugins.json` is the source of truth for indexed community plugins:

```json
{
  "version": 1,
  "plugins": [
    {
      "pluginId": "weatherTool",
      "version": "0.1.0",
      "type": "tool",
      "source": "https://github.com/example/weatherTool",
      "commit": "abcdef1234567890",
      "submodule": "packages/tools/weatherTool",
      "path": ".",
      "status": "pending",
      "support": "community",
      "review": "reviews/weatherTool/0.1.0.json"
    }
  ]
}
```

Field rules live in [`schemas/registry.ts`](./schemas/registry.ts). Scripts and skills should depend on the schema instead of duplicating validation logic.

## Plugin Dependency Boundary

Plugin submodules are independent repositories. They are intentionally excluded from the root pnpm workspace.

Each plugin repository should provide:

- explicit dependency versions in its own `package.json`;
- its own `packageManager` field;
- its own `pnpm-lock.yaml`;
- no `catalog:` or `workspace:` dependency specifiers.

The root `pnpm-workspace.yaml` catalog is only for this registry repository's scripts, schemas, and tests.

## Requirements

- Node.js `>=22`
- pnpm `>=10`
- Recommended pinned version: `pnpm@10.28.2`

```bash
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install
```

## Common Commands

```bash
# Type check repository scripts and schemas
pnpm run type-check

# Run deterministic tests
pnpm test

# Validate registry, submodules, and policy gates
pnpm run validate

# Unified human/Agent plugin lifecycle CLI
pnpm run plugin -- add --from packages/tools/googleSheets --json
pnpm run plugin -- check googleSheets

# Add or update a registry entry
pnpm run registry -- upsert --plugin googleSheets --version 0.1.0 --source <plugin-repo-url> --commit <commit-sha>

# Infer registry metadata from a local submodule package
pnpm run registry -- upsert --from packages/tools/googleSheets --source <plugin-repo-url> --commit <commit-sha>

# Generate a dry-run publish receipt without mutating registry state
pnpm run publish -- --plugin <pluginId> --review <reviews/plugin/version.json> --dry-run --skip-build

# Revoke a plugin in repository state and write a revoke event
pnpm run revoke -- --plugin <pluginId> --reason broken --details "Fails current package check"
```

## Add a Community Plugin

Community plugin source code should live in its own repository. This registry only keeps a pinned reference.

1. Ensure the plugin repository builds independently with explicit dependency versions and a committed `pnpm-lock.yaml`.

2. Add the plugin repository as a submodule:

   ```bash
   git submodule add <plugin-repo-url> packages/tools/<pluginId>
   git -C packages/tools/<pluginId> checkout <commit-sha>
   ```

3. Add or update the matching entry in `plugins.json`:

   ```bash
   pnpm run plugin -- add --from packages/tools/<pluginId>
   ```

4. Run deterministic validation:

   ```bash
   pnpm run validate
   pnpm test
   ```

5. Use the `plugin-review` skill to inspect the pinned plugin and write a review verdict, usually at:

   ```text
   reviews/<pluginId>/<version>.json
   ```

6. Open a pull request containing the registry entry, submodule pointer, validation result, and review artifact.

## AI Skills

This repository intentionally keeps subjective review and summary work in Codex skills:

- `develop-fastgpt-plugin`: helps contributors create, test, package, and submit FastGPT plugins.
- `plugin-discovery`: prepares candidate registry entries, submodule commands, and intake notes.
- `plugin-review`: reviews a pinned plugin candidate and writes a structured `pass`, `warn`, or `fail` verdict.
- `daily-summary`: reads committed lifecycle events and current registry state to produce a human-readable daily digest.

Deterministic scripts remain responsible for schema validation, policy gates, package checks, publish event writing, and revoke event writing.

## Marketplace Publishing

Publishing is manual and gated:

1. `validate.yml` verifies registry schema, submodule consistency, source layout, and policy gates.
2. `plugin-review` produces a structured AI verdict.
3. `publish.yml` builds or accepts a `.pkg`, requires a passing review file, uploads to Marketplace, writes a publish event, updates `plugins.json`, and commits lifecycle state back to the repository.
4. The publish receipt is uploaded as a GitHub Actions artifact under `dist/receipts`.

Required GitHub Actions secrets:

- `MARKETPLACE_BASE_URL`
- `MARKETPLACE_AUTH`
- Optional `NPM_TOKEN` when private package installation is needed.

## Revoke Flow

`revoke.yml` is currently a repository-side action. It:

- marks the registry entry as `revoked`;
- writes a committed revoke event under `events/<yyyy-mm-dd>/`;
- records optional `marketplace_release_id` for future marketplace-side revoke integration.

Marketplace-side revoke or hide APIs are intentionally left as an extension point. When those APIs exist, `scripts/revoke.ts` can attach that call before writing the final event.

## Related Repositories

- [FastGPT](https://github.com/labring/FastGPT): the main FastGPT repository.
- [fastgpt-plugin](https://github.com/labring/fastgpt-plugin): FastGPT plugin system, CLI, and SDK infrastructure.
- [fastgpt-official-plugins](https://github.com/labring/fastgpt-official-plugins): officially maintained FastGPT plugins.

## License

[Apache-2.0](./LICENSE)
