---
name: develop-fastgpt-plugin
description: 新手友好的 FastGPT 插件开发向导。Use when the user wants help installing Git/GitHub CLI/Node/pnpm, clarifying plugin requirements, choosing FastGPT plugin type (tool or tool-suite), scaffolding and implementing a plugin, testing/debugging with @fastgpt-plugin/cli, packaging, publishing to GitHub, or submitting a pull request to a FastGPT plugin repository/community registry.
---

# Develop FastGPT Plugin

使用本 skill，把技术小白的插件想法一步步变成可运行、可测试、可提交 PR 的 FastGPT 插件。

## 新手沟通规则

- 默认使用中文沟通，命令、代码标识符和文件名保持英文。
- 每次只给用户一个小步骤，并附上可复制命令和成功标志。
- 需求缺失时最多问三个聚焦问题；默认值明显时直接推进并说明假设。
- 第一次出现术语时顺手解释：`tool` 是一个可调用能力，`tool-suite` 是一组相关能力。
- 不让用户在聊天里粘贴密钥。使用 `.env`、本地 secret 文件或 CLI 的 `--secrets-file`，并确认这些文件不会进入 Git。
- 安装、联网拉取、发布、推送、创建 PR 前说明影响；当前环境需要授权时再请求授权。

## 总流程

1. 准备环境。
2. 理解需求并选择插件类型。
3. 创建骨架并开发插件。
4. 本地测试和调试。
5. 发布源码/包并提交 PR。

## 1. 准备环境

先检测用户机器状态：

```bash
git --version
gh --version
node -v
corepack --version
pnpm -v
pnpm fastgpt-plugin --help
```

缺工具时按操作系统给出安装命令：

```bash
# macOS
brew install git gh node
corepack enable
corepack prepare pnpm@10.28.2 --activate
```

```powershell
# Windows PowerShell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
winget install --id OpenJS.NodeJS.LTS -e
corepack enable
corepack prepare pnpm@10.28.2 --activate
```

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y git curl nodejs npm
npm install -g corepack
corepack enable
corepack prepare pnpm@10.28.2 --activate
```

再配置 GitHub 和 Git 身份：

```bash
gh auth login
gh auth status
git config --global user.name "<your-name>"
git config --global user.email "<your-email>"
```

已有仓库时：

```bash
git clone <repo-url>
cd <repo>
pnpm install
```

Node 和 pnpm 版本以当前仓库 `package.json` 的 `engines` 和 `packageManager` 为准。

## 2. 判断需求和插件类型

先收集刚好够用的信息：

- 插件一句话要做什么？
- 需要哪些输入？FastGPT 最终要得到什么输出？
- 是否调用外部 API？这个 API 是否需要 key 或 token？
- 这是一个动作，还是多个相关动作？
- 给出 1-3 个例子，最好包含一个失败或边界情况。

选择插件类型：

- `tool`：一个独立动作，例如查天气、文本转换、调用一个 API endpoint、计算结果。
- `tool-suite`：多个相关动作，共用领域、凭证或客户端，例如 Notion 的搜索/新增/更新，CRM 的客户/订单/工单。

面向新手时优先推荐 `tool`；用户明确需要多个相关能力时再选 `tool-suite`。单工具后续可以扩展成工具集。

编码前先判断集成形态：

- 无外部服务：纯计算、格式化、解析或本地转换。
- 无凭证公开 API：重点处理网络错误、限流和空结果。
- 需要凭证的 API：定义 `secrets`，说明 key 获取方式，严禁硬编码。
- 文件类插件：明确上传/下载行为，并用小文件测试。

## 3. 开发

创建骨架前，优先读取 CLI 使用说明：

```bash
sed -n '1,240p' node_modules/@fastgpt-plugin/cli/skills/cli-usage/SKILL.md
```

没有该文件时读取 CLI help：

```bash
pnpm fastgpt-plugin create --help
pnpm fastgpt-plugin build --help
pnpm fastgpt-plugin check --help
pnpm fastgpt-plugin pack --help
pnpm fastgpt-plugin debug --help
```

创建单工具：

```bash
pnpm fastgpt-plugin create <plugin-name> --type tool --cwd <target-parent> --description "<description>"
```

创建工具集：

```bash
pnpm fastgpt-plugin create <plugin-name> --type tool-suite --cwd <target-parent> --description "<description>"
```

选择目标目录：

- 在 `fastgpt-official-plugins` 中，默认放到 `packages/tools`。
- 在本社区索引仓库中，插件应先在独立源码仓库开发；入库时再作为固定 commit 的 submodule 放到 `plugins/<pluginId>`。
- 用户只想做本地原型时，创建到清晰命名的工作目录，并说明发布仍需要 GitHub 仓库。

生成后先读文件再改：

```bash
find <plugin-dir> -maxdepth 2 -type f | sort
sed -n '1,220p' <plugin-dir>/package.json
sed -n '1,240p' <plugin-dir>/index.ts
```

按模板结构实现：

- 保持 `package.json` scripts 和依赖风格与模板一致。
- 入口文件只负责 manifest、schemas 和 handler wiring。
- 模板提供 `src/` 时，把可复用运行逻辑放到 `src/`。
- 保持输入/输出 schema 与用户可见配置一致。
- 只有真实凭证才添加 `secrets`。
- 添加简洁 `README.md`，包含用途、输入、输出、secrets、示例、本地测试命令。
- 添加依赖前先找相邻插件或模板里已有的工具函数和模式。

## 4. 测试和调试

先在插件目录执行本地脚本：

```bash
pnpm test
pnpm build
```

再执行 CLI 验证：

```bash
pnpm fastgpt-plugin build --entry <plugin-dir> --output <plugin-dir>/dist
pnpm fastgpt-plugin check --entry <plugin-dir> --output <plugin-dir>/dist
pnpm fastgpt-plugin pack --entry <plugin-dir> --dist <plugin-dir>/dist --output <plugin-dir>
```

用样例输入调试：

```bash
pnpm fastgpt-plugin debug <plugin-dir> --run --input '{"example":"value"}'
```

需要 secrets 时，使用本地忽略文件：

```bash
printf '{ "apiKey": "replace-me" }\n' > .secrets.local.json
pnpm fastgpt-plugin debug <plugin-dir> --run --input-file test/input.json --secrets-file .secrets.local.json
```

带新手排错时：

- 先读完整错误信息。
- 判断失败属于安装、TypeScript、schema/config、运行时 API、打包哪一类。
- 每次只修一个原因，并重跑最小失败命令。
- 样例输入保持小而稳定。
- 生成 `.pkg` 后再进入发布讨论。

## 5. 发布和提交 PR

插件源码仓库中：

```bash
git status
git checkout -b feat/<pluginId>
git add .
git commit -m "feat(<pluginId>): add FastGPT plugin"
git push -u origin feat/<pluginId>
gh pr create --title "feat(<pluginId>): add FastGPT plugin" --body "<summary>"
```

本社区索引仓库中，源码仓库推送完成后：

```bash
git rev-parse HEAD
git submodule add <plugin-repo-url> plugins/<pluginId>

pnpm run registry -- upsert --from plugins/<pluginId> --source <plugin-repo-url> --commit <commit-sha>
```

`registry` 脚本会按 `schemas/registry.ts` 更新 `plugins.json`，随后运行：

```bash
pnpm run validate
pnpm test
```

准备社区索引 PR 时，使用已有 `plugin-discovery` skill 生成 intake bundle。PR 应包含 registry entry、submodule 指针、验证结果，以及仓库要求的 policy review artifact。

创建 PR 前确认：

- `git status` 只包含本次预期文件。
- 没有提交 secrets、tokens、`.env`、`.secrets.local.json`。
- `README.md` 能让新手完成配置和测试。
- PR body 包含命令输出或简短验证摘要。

最终交付给用户时说明：改了哪些文件、选择的插件类型、关键假设、执行过的命令、验证结果、PR URL，以及未验证的外部 API 等剩余风险。
