# sec CLI - Effect Agent MVP Implementation

## Architecture

sec CLI is built on the Effect Agent framework with celld SQLite storage.

```
sec run [--session ID] <prompt>     # Single call (with session context)
sec chat --use-sqlite               # Interactive chat with celld Event Log
sec sqlite <subcmd>                 # Direct SQLite access
```

## Key Components

### Session Actor (MAKA Pattern)
- `src/storage/celld-session-storage.ts` - SQLite storage layer
  - `sessions` table: session metadata + JSON entries
  - `runtime_events` table: write-once event log
  - `usage` table: append-only token accounting
- `src/index.ts` - cmdChatCelld uses spawnSync to avoid Effect fiber conflicts

### Effect Agent Integration
- `src/index.ts` - createProgram() wires AgentRuntime with:
  - OpenRouterLanguageModel (via cliproxy)
  - SecToolkit (read, bash, edit, websearch)
  - ThreadHistory (transient per-call)
  - AgentPolicy (5 turns, 10 tool calls, 60s)

### genId Uniqueness
`Date.now().toString(36)` + random suffix + second timestamp slice.
Must match in both `index.ts` and `celld-session-storage.ts`.

## spawnSync Pattern
cmdChatCelld uses `Bun.spawnSync` instead of direct `Effect.runPromise`
to avoid fiber conflicts with Node.js readline event loop.

## Multi-turn Context
`sec run --session <id>` loads previous entries from SQLite and prepends
as context message before the new prompt.

## TODO
- [ ] ToolConcurrency > 1 in policy
- [ ] Parallel tool execution
- [ ] Worker subagent (fork session)
- [ ] Runtime Kernel (model loop control)
