# SEC Project Tasks

> Effect-native AI CLI using Effect Agent framework. Tracks all work via DAG with multi-layer persistence.

## Quick Status

| ID | Title | Status | Depends |
|----|-------|--------|---------|
| sec-core | sec 核心功能 | ✅ done | - |
| sec-run | sec run 单次调用 | ✅ done | - |
| sec-chat | sec chat REPL | ✅ done | sec-session |
| sec-session | sec session 持久化 | ✅ done | - |
| sec-effect-agent | effect-agent 重构 | ✅ done | - |
| sec-agent-schema | Schema 定义 | ✅ done | - |
| sec-agent-runtime | Runtime 集成 | ✅ done | - |
| sec-serve | sec serve HTTP | ⏳ todo | - |
| sec-acp | sec acp 协议 | ⏳ todo | - |
| sec-tools | 工具调用 | 📋 planned | sec-effect-agent |
| sec-tool-read | read 工具 | 📋 planned | sec-effect-agent |
| sec-tool-bash | bash 工具 | 📋 planned | sec-effect-agent |
| sec-tool-edit | edit 工具 | 📋 planned | sec-tool-read |
| sec-tool-websearch | websearch 工具 | 📋 planned | - |
| sec-agent-tools | Tools 实现 | 📋 planned | - |
| sec-tui | TUI 界面 | 📋 planned | sec-tools |
| sec-multica | multica 集成 | 📋 planned | sec-acp |
| sec-docs | 文档 | 🔄 in_progress | - |
| sec-docs-usage | 使用文档 | ✅ done | - |
| sec-docs-api | API 文档 | ⏳ todo | - |
| sec-docs-arch | 架构文档 | ⏳ todo | - |

## DAG Visualization

```
                    ┌─── sec-run (done)
                    │
                    ├─── sec-session (done) ─── sec-chat (done)
                    │         │
                    │         └─── sec-serve (todo)
                    │
        sec-core ───┤
        (done)      ├─── sec-acp (todo) ─── sec-multica (planned)
                    │
                    └─── sec-effect-agent (done)
                              │
                              ├─── sec-agent-schema (done)
                              ├─── sec-agent-runtime (done)
                              ├─── sec-agent-tools (planned)
                              │
                    sec-tools │
                    (planned) │
                              ├─── sec-tool-read (planned)
                              │         │
                              │         └─── sec-tool-edit (planned)
                              ├─── sec-tool-bash (planned)
                              └─── sec-tool-websearch (planned)
                                        │
                                    sec-tui (planned)

                    sec-docs (in_progress)
                    ├─── sec-docs-usage (done)
                    ├─── sec-docs-api (todo)
                    └─── sec-docs-arch (todo)
```

## Task Details

### ✅ Done

- **sec-core**: sec 核心功能
  - run, chat, session, models 命令
- **sec-run**: sec run 单次调用
  - Provider: CLIProxyAPI (openrouter/openrouter/free)
  - Tested: "1+1等于多少" → "1+1等于2。"
- **sec-chat**: sec chat REPL 会话
  - 多轮对话
  - 自动保存 session
- **sec-session**: sec session 持久化
  - 路径: ~/.local/share/sec/sessions/{id}.json
  - 命令: new, list, show, rm
- **sec-effect-agent**: effect-agent 重构
  - 从直接 fetch 迁移到 effect-agent runtime
- **sec-agent-schema**: Schema-first 定义
  - UserMessage, AiResponse, ReadParams
  - 用 Schema.Class
- **sec-agent-runtime**: Runtime 集成
  - AgentRuntime.run
  - Provider: OpenAiClient + OpenAiLanguageModel
- **sec-docs-usage**: 使用文档
  - docs/usage.md

### ⏳ Todo

- **sec-serve**: HTTP server
  - /v1/chat/completions endpoint
  - 用于 opencode TUI
- **sec-acp**: ACP 协议
  - for multica spawn/serve
- **sec-docs-api**: API 文档
  - OpenAI compatible
- **sec-docs-arch**: 架构文档
  - effect-agent runtime model

### 📋 Planned

- **sec-tools**: 工具调用系统
- **sec-tool-read**: 读取文件
- **sec-tool-bash**: 执行 bash
- **sec-tool-edit**: 编辑文件
- **sec-tool-websearch**: 网页搜索
- **sec-agent-tools**: Toolkit 组合
- **sec-tui**: TUI 界面
- **sec-multica**: multica shim

## Progress Log

### 2024-09-04
- ✅ jj-forklift 安装成功
- ✅ slate-effect-cli 转换为 jj colocate 仓库
- ✅ 推送到 GitHub: https://github.com/WeiYiAcc/slate-effect-cli
- ✅ 创建 PR #1 并合并
- ✅ 用 effect-agent 模式重写 sec
- ✅ sec run 测试通过

## Sync Locations

任务数据被持久化到多个位置：
- `slate-effect-cli/.sec-tasks/tasks-dag.json` (JSON)
- `slate-effect-cli/.sec-tasks/tasks.md` (Markdown)
- `slate-effect-cli/.sec-tasks/tasks.org` (Emacs Org-mode)
- `slate-effect-cli/.sec-tasks/tasks.edn` (EDN for Clojure)
- ariadne-fact (structured fact DB)
- logseq graph (block-based notes)
- prime-agent ai-memory (durable memory)
