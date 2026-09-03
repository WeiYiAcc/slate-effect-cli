# SEC Tasks

Project: [slate-effect-cli](https://github.com/WeiYiAcc/slate-effect-cli)

## 任务状态

| 任务 | 状态 | 依赖 |
|------|------|------|
| sec-run | 已完成 | - |
| sec-chat | 已完成 | sec-session |
| sec-session | 已完成 | - |
| sec-effect-agent | 已完成 | - |
| sec-serve | 待办 | - |
| sec-acp | 待办 | - |
| sec-tools | 待办 | sec-effect-agent |
| sec-tool-read | 待办 | sec-effect-agent |
| sec-tool-bash | 待办 | sec-effect-agent |
| sec-tui | 待办 | sec-tools |
| sec-multica | 待办 | sec-acp |

## 文件

- `tasks.csv` - CSV 格式
- `tasks-dag.json` - JSON DAG
- `tasks.md` - Markdown
- `sec-tasks.ts` - CLI 工具

## CLI

```bash
sec-tasks           # 任务列表
sec-tasks dag       # DAG 依赖
sec-tasks ready     # 可开始任务
```

## 持久化 (jj)

```bash
jj log --limit 5
forklift submit
```
