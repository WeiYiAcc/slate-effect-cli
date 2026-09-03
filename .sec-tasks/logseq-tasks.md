# SEC Project Tasks

- Project:: [[https://github.com/WeiYiAcc/slate-effect-cli][slate-effect-cli]]
- Status:: Active
- Architecture:: [[effect-agent runtime model]]

## Done

- [[sec-run]] - sec run 单次调用
- [[sec-chat]] - sec chat REPL 会话
- [[sec-session]] - sec session 持久化
- [[sec-effect-agent]] - effect-agent 重构
- [[sec-agent-schema]] - Schema 定义
- [[sec-agent-runtime]] - Runtime 集成
- [[sec-docs-usage]] - 使用文档

## Todo

- [[sec-serve]] - sec serve HTTP server
- [[sec-acp]] - sec acp ACP 协议
- [[sec-docs-api]] - API 文档
- [[sec-docs-arch]] - 架构文档

## Planned

- [[sec-tools]] - 工具调用系统
- [[sec-tool-read]] - read 工具
- [[sec-tool-bash]] - bash 工具
- [[sec-tool-edit]] - edit 工具
- [[sec-tool-websearch]] - websearch 工具
- [[sec-agent-tools]] - Toolkit 组合
- [[sec-tui]] - TUI 界面
- [[sec-multica]] - multica 集成

---

#sec #cli #effect-agent

---

#sec-tasks #DAG

## DAG Dependencies

```
sec-tools → sec-effect-agent
sec-tool-edit → sec-tool-read
sec-tui → sec-tools
sec-multica → sec-acp
sec-chat → sec-session
```

---

#sec-tasks #done

## sec-run
- Provider: CLIProxyAPI (openrouter/openrouter/free)
- 测试: "1+1等于多少" → "1+1等于2。"

## sec-session
- 路径: ~/.local/share/sec/sessions/{id}.json
- 命令: new, list, show, rm

## sec-effect-agent
- Schema-first 定义
- Tool.make + Toolkit 组合
- AgentRuntime.run

---

#sec-tasks #progress

## 2024-09-04

- [X] jj-forklift 安装成功
- [X] slate-effect-cli 转换为 jj colocate 仓库
- [X] 推送到 GitHub
- [X] 创建 PR #1 并合并
- [X] 用 effect-agent 模式重写 sec
- [X] sec run 测试通过
