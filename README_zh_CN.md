<div align="center">
<a href="https://tryfastgpt.ai/"><img src="https://github.com/labring/FastGPT/raw/main/.github/imgs/logo.svg" width="120" height="120" alt="fastgpt logo"></a>

# FastGPT Community Plugins

<p align="center">
  <a href="./README_zh_CN.md">简体中文</a> |
  <a href="./README.md">English</a>
</p>

[FastGPT](https://github.com/labring/FastGPT) 社区插件索引与发布自动化仓库。

本仓库用于索引社区贡献的 FastGPT 插件，执行确定性校验，保留 Agent 辅助审核证据，记录 publish/revoke 生命周期事件，并为通过审核的社区插件提供发布到 FastGPT Marketplace 的 workflow 入口。
</div>

## 仓库定位

- 通过 `plugins.json` 维护轻量级社区插件索引。
- 每个插件源码位于独立仓库，本仓库只在 `plugins/<pluginId>` 下保存固定 commit 的 git submodule。
- `pluginId` 使用 lower camelCase，例如 `googleSheets`。
- 发布前执行 schema、submodule、源码结构和策略规则校验。
- 使用 AI skills 完成插件候选审核和每日 publish/revoke 摘要。
- 通过 GitHub Actions 发布审核通过的 `.pkg` 产物。
- 记录 publish 和 revoke 的仓库侧生命周期状态。

社区插件会经过可发布性和可追踪性审核。审核范围聚焦发布准入和链路留痕；插件源码、维护、持续可用性和后续功能扩展默认由贡献者负责，除非另有说明。

## 目录结构

```text
.
├── .agents/skills/
│   ├── develop-fastgpt-plugin/     # 新手友好的 FastGPT 插件开发向导
│   ├── plugin-discovery/           # 候选插件 intake 辅助
│   ├── plugin-review/              # AI 可发布性审核 skill
│   └── daily-summary/              # AI 每日生命周期摘要 skill
├── .github/workflows/
│   ├── validate.yml                # PR 和手动 registry 校验
│   ├── publish.yml                 # 手动发布 workflow
│   └── revoke.yml                  # 手动仓库侧 revoke workflow
├── events/<yyyy-mm-dd>/            # 已提交的 publish/revoke 生命周期事件
├── plugins/<pluginId>/             # 社区插件 submodule
├── reviews/<pluginId>/             # AI review verdict 产物
├── schemas/                        # registry、review、lifecycle event 契约
├── scripts/                        # 校验、发布、revoke、策略规则脚本
├── tests/                          # 确定性规则的 Vitest 测试
├── plugins.json                    # 机器可读的社区插件索引
├── package.json                    # 根工程脚本和工具链版本
├── pnpm-workspace.yaml             # workspace 与 catalog 依赖版本
└── turbo.json                      # 任务编排
```

## Registry 契约

`plugins.json` 是已索引社区插件的事实来源：

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
      "submodule": "plugins/weatherTool",
      "path": ".",
      "status": "pending",
      "support": "community",
      "review": "reviews/weatherTool/0.1.0.json"
    }
  ]
}
```

字段规则在 [`schemas/registry.ts`](./schemas/registry.ts) 中定义。脚本和 skills 应依赖这个 schema，避免重复实现校验逻辑。

## 环境要求

- Node.js `>=22`
- pnpm `>=10`
- 推荐使用仓库固定版本 `pnpm@10.28.2`

```bash
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install
```

## 常用命令

```bash
# 类型检查仓库脚本和 schemas
pnpm run type-check

# 运行确定性测试
pnpm test

# 校验 registry、submodule 和策略规则
pnpm run validate

# 新增或更新 registry 条目
pnpm run registry -- upsert --plugin googleSheets --version 0.1.0 --source <plugin-repo-url> --commit <commit-sha>

# 从本地 submodule package 推断 registry 元信息
pnpm run registry -- upsert --from plugins/googleSheets --source <plugin-repo-url> --commit <commit-sha>

# 生成 dry-run 发布 receipt，不修改 registry 状态
pnpm run publish -- --plugin <pluginId> --review <reviews/plugin/version.json> --dry-run --skip-build

# 在仓库侧 revoke 插件并写入 revoke event
pnpm run revoke -- --plugin <pluginId> --reason broken --details "Fails current package check"
```

## 新增社区插件

社区插件源码应放在独立仓库中。本仓库只保存固定引用。

1. 将插件仓库添加为 submodule：

   ```bash
   git submodule add <plugin-repo-url> plugins/<pluginId>
   git -C plugins/<pluginId> checkout <commit-sha>
   ```

2. 在 `plugins.json` 中新增或更新对应条目：

   ```bash
   pnpm run registry -- upsert --from plugins/<pluginId> --source <plugin-repo-url> --commit <commit-sha>
   ```

3. 运行确定性校验：

   ```bash
   pnpm run validate
   pnpm test
   ```

4. 使用 `plugin-review` skill 检查固定 commit 的插件，并写入 review verdict，推荐路径为：

   ```text
   reviews/<pluginId>/<version>.json
   ```

5. 提交 PR，包含 registry 条目、submodule 指针、校验结果和 review artifact。

## AI Skills

本仓库刻意把带判断性的审核和摘要工作放在 Codex skills 中：

- `develop-fastgpt-plugin`：帮助贡献者创建、测试、打包和提交 FastGPT 插件。
- `plugin-discovery`：准备候选 registry 条目、submodule 命令和 intake notes。
- `plugin-review`：审核固定 commit 的插件候选，并输出结构化 `pass`、`warn` 或 `fail` verdict。
- `daily-summary`：读取已提交的 lifecycle events 和当前 registry 状态，生成可读的每日摘要。

确定性脚本负责 schema 校验、策略规则、package 检查、publish event 写入和 revoke event 写入。

## Marketplace 发布

发布是手动触发且带审核门禁的流程：

1. `validate.yml` 校验 registry schema、submodule 一致性、源码结构和策略规则。
2. `plugin-review` 生成结构化 AI verdict。
3. `publish.yml` 构建或接收 `.pkg`，要求 review 文件通过，上传 Marketplace，写入 publish event，更新 `plugins.json`，并将生命周期状态提交回仓库。
4. publish receipt 会作为 GitHub Actions artifact 上传到 `dist/receipts`。

GitHub Actions 需要配置以下 secrets：

- `MARKETPLACE_BASE_URL`
- `MARKETPLACE_AUTH`
- 私有包安装需要时可配置 `NPM_TOKEN`。

## Revoke 流程

`revoke.yml` 当前是仓库侧 action。它会：

- 将 registry 条目标记为 `revoked`；
- 在 `events/<yyyy-mm-dd>/` 下写入已提交的 revoke event；
- 记录可选的 `marketplace_release_id`，为未来 marketplace 侧 revoke 集成预留扩展点。

Marketplace 侧 revoke 或隐藏接口目前刻意保留为扩展点。接口存在后，可以在 `scripts/revoke.ts` 中先调用 marketplace，再写入最终事件。

## 相关仓库

- [FastGPT](https://github.com/labring/FastGPT)：FastGPT 主仓库。
- [fastgpt-plugin](https://github.com/labring/fastgpt-plugin)：FastGPT 插件系统、CLI 和 SDK 基础设施。
- [fastgpt-official-plugins](https://github.com/labring/fastgpt-official-plugins)：FastGPT 官方维护插件仓库。

## License

[Apache-2.0](./LICENSE)
