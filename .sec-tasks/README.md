# .sec-tasks/ - SEC Project Task Tracking

Multi-format task tracking for the SEC project. Single source of truth: `tasks-dag.json`.

## Files

| File | Format | Use |
|------|--------|-----|
| `tasks-dag.json` | JSON | Authoritative data, read by sec-tasks tool |
| `tasks.md` | Markdown | General documentation |
| `tasks.org` | Org-mode | Emacs users |
| `tasks.edn` | EDN | Clojure readers |
| `tasks.datascript.edn` | Datascript/DB | Logseq, Datascript import |
| `logseq-tasks.md` | Logseq | Logseq block-based notes |
| `obsidian-tasks.md` | Obsidian | Obsidian vault with wiki links |
| `sec-tasks.ts` | TypeScript | CLI viewer tool |

## CLI Tool

```bash
sec-tasks                 # Show all tasks
sec-tasks dag             # Show DAG dependencies
sec-tasks <task-id>       # Show task details
sec-tasks ready           # Show next ready tasks
sec-tasks done            # Show done tasks
sec-tasks todo            # Show todo tasks
sec-tasks planned         # Show planned tasks
sec-tasks in-progress     # Show in-progress tasks
sec-tasks sync            # Sync all formats
```

## Task Status

- `done` - Completed
- `in_progress` - Currently working on
- `todo` - To be done
- `planned` - Future plan

## DAG Format

```json
{
  "id": "sec-tools",
  "title": "工具调用系统",
  "status": "planned",
  "depends": ["sec-effect-agent"],
  "children": ["sec-tool-read", "sec-tool-bash", "sec-tool-edit"]
}
```

- `depends`: tasks that must be done first
- `children`: sub-tasks

## Current Status

- 7 done
- 4 todo
- 8 planned
- 1 in_progress

## External Sync (when MCP available)

```python
import ariadne_fact
await ariadne_fact.add({...})

import ai_memory
await memory.call_tool("add", {...})
```
