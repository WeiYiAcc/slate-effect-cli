# sec - Effect Agent CLI

基于 Effect Agent 运行时模型的命令行 AI 工具。sec 是一个有真实工具能力的 Agent CLI。

## 技术栈

- **Effect Agent Runtime**: `@effect-agent/core` + `@effect-agent/engine` (v0.1.0-beta.47)
- **AI Provider**: `@effect/ai-openrouter` + `effect@4.0.0-rc.112`
- **Tools**: read, bash, edit, websearch (基于 `effect/unstable/ai` Tool.make())
- **Session Storage**: celld SQLite (`bun:sqlite`) + 文件系统 JSON
- **Runtime**: Bun + TypeScript

## 架构

```
sec CLI (Effect Agent)
  toolkit: [read, bash, edit, websearch]
  policy: maxTurns=5, maxToolCalls=10, toolConcurrency=2
  ↓
cliproxyapi (https://cliproxy.wyrunning.dpdns.org/v1)
  ├─ API key: ak7548697
  └─ → OpenRouter → minimax/minimax-m3:free
```

## 工具

4 个真实工具，Agent 可调用：

| 工具 | 用途 | 实现 |
|------|------|------|
| `read` | 读文件 (offset/limit) | `fs.readFileSync` |
| `bash` | 执行命令 | `child_process.spawn` |
| `edit` | 替换文件内容 | `fs.writeFileSync` |
| `websearch` | DuckDuckGo 搜索 | `fetch(url)` |

## 使用

```bash
# 单次请求（带工具调用）
sec run "What is /tmp/test.txt?"
sec run "Run: echo hello"
sec run "Search for 'TypeScript effect'"

# 后台任务
sec run "background job" --background

# 多轮对话
sec chat --session <id>

# 会话管理
sec session new|list|show|rm

# celld SQLite 存储（MAKA-style Event Log）
sec sqlite new "my-session"   # 创建 session
sec sqlite list              # 列出所有 session
sec sqlite show <id>         # 查看 session
sec sqlite events <id>       # 查看事件日志
sec sqlite rm <id>           # 删除
sec sqlite usage <id>        # token 使用

# 其他
sec jobs list|rm
sec models
sec agent list|invoke|status
```

## 安装

```bash
cd /home/weiyiacc/slate-effect-cli
bun install
```

## 开发

```bash
bun run src/index.ts run "Run: echo hello"
bun run src/index.ts run "Use the read tool to read README.md"
bun run src/index.ts sqlite list
```

## 已知问题

- 模型 JSON 输出格式不稳定
- 使用 `minimax/minimax-m3:free` 模型

## 相关文档

- [Effect Agent](https://effect-agent.com/guide/getting-started)
- [@effect/ai-openrouter](https://www.npmjs.com/package/@effect/ai-openrouter)
- [OpenRouter](https://openrouter.ai/)
