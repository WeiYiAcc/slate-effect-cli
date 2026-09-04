# sec-cell 实现指南

> 基于 ARCHITECTURE.md、CELLD-VS-RIVET.md、ACTOR-HONEST.md 讨论文档

---

## 1. 当前状态

### 已安装
- ✅ celld dev 运行在 9877 端口
- ✅ agentos (`@rivet-dev/agentos`) 已安装
- ✅ sec-cell 项目已有基础代码

### 项目结构
```
sec-cell/
├── .celld/
│   └── dev/
│       ├── objects.sqlite3  (celld storage)
│       └── runtime/         (celld runtime)
├── src/index.ts            (CF Worker 入口)
├── agentos-service.mjs     (简化的 actor 服务)
├── actor-service.mjs       (简化 actor)
└── wrangler.jsonc         (Wrangler 配置)
```

### celld 已验证工作
```
curl http://127.0.0.1:9877/
→ {"service":"sec-cell","endpoints":["/health","/api/agent/*"]}
```

---

## 2. 架构设计

### 目标架构

```
sec-cell = celld + agentos + Effect Agent

┌─────────────────────────────────────────────────────────────┐
│                    sec-cell                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  celld (分布式存储)                                  │  │
│  │  ├── KV Namespace                                  │  │
│  │  ├── D1 (SQLite)                                  │  │
│  │  ├── Queue                                         │  │
│  │  └── Bucket                                        │  │
│  └─────────────────────────────────────────────────────┘  │
│                           │                                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  agentos (Actor Runtime)                            │  │
│  │  ├── Session Actor                                 │  │
│  │  ├── Tool Actor                                    │  │
│  │  └── Worker Actor                                  │  │
│  └─────────────────────────────────────────────────────┘  │
│                           │                                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Effect Agent (AI Provider)                          │  │
│  │  ├── Tool.make()                                   │  │
│  │  └── Effect Layer                                  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 组件关系

| 组件 | 角色 | 对应文档 |
|------|------|---------|
| **celld** | 分布式存储 | CELLD-VS-RIVET.md |
| **agentos** | Actor Runtime | ARCHITECTURE.md §3 |
| **Effect Agent** | AI Provider | ARCHITECTURE.md §4 |
| **Session Manager** | Session 生命周期 | PI-VS-MAKA.md |
| **Tool Registry** | 工具注册 | ARCHITECTURE.md §5 |

---

## 3. 实现步骤

### Step 1: 验证 agentos 集成

celld 已经有 agentos 集成，我们需要验证它能正常工作：

```bash
# 检查 agentos 是否正常工作
curl http://127.0.0.1:9877/api/agent/status
```

### Step 2: 实现 Session Actor

基于 MAKA 的 Event Log 设计：

```typescript
// src/session-actor.ts
interface SessionState {
  id: string;
  name: string;
  model: string;
  entries: Entry[];      // write-once
  values: Map<string, any>;  // mutable
  usage: Usage[];        // append-only
  events: RuntimeEvent[];  // event log
  branch: string;
  operationState: string;
}

class SessionActor {
  readonly id: string;
  private state: SessionState;
  private storage: SecStorage;
  
  async appendEntry(entry: Entry): Promise<void>;
  async setValue(key: string, value: any): Promise<void>;
  async recordUsage(usage: Usage): Promise<void>;
  async appendEvent(event: RuntimeEvent): Promise<void>;
  async fork(branchName: string): Promise<string>;
}
```

### Step 3: 集成 Effect Agent

```typescript
// src/effect-integration.ts
import { Effect, Layer, Tool } from "effect";

const sessionTools = [
  Tool.make({
    name: "create_session",
    description: "Create a new session",
    parameters: Effect.Schema.Struct({
      name: Effect.Schema.String,
      model: Effect.Schema.String,
    }),
  }, ({ name, model }) =>
    Effect.gen(function* () {
      const actor = new SessionActor({ id: randomUUID(), name, model });
      yield* actor.start();
      return actor.id;
    })
  ),
  
  Tool.make({
    name: "append_message",
    description: "Append a message to session",
    parameters: Effect.Schema.Struct({
      sessionId: Effect.Schema.String,
      content: Effect.Schema.String,
      role: Effect.Schema.Union(
        Effect.Schema.Literal("user"),
        Effect.Schema.Literal("assistant"),
      ),
    }),
  }, ({ sessionId, content, role }) =>
    Effect.gen(function* () {
      const actor = yield* SessionActorRegistry.get(sessionId);
      yield* actor.appendEntry({ id: randomUUID(), role, content, ts: Date.now() });
    })
  ),
];
```

### Step 4: 实现 Runtime Kernel

```typescript
// src/runtime-kernel.ts
class RuntimeKernel {
  constructor(
    private storage: SecStorage,
    private modelProvider: ModelProvider,
    private tools: Tool[],
  ) {}
  
  async runTurn(sessionId: string): Promise<TurnResult> {
    return Effect.runPromise(
      Effect.gen(this, function* () {
        // 1. Load session
        const session = yield* this.storage.getSession(sessionId);
        
        // 2. Build context
        const context = yield* this.buildContext(session);
        
        // 3. Call model with tools
        const response = yield* this.modelProvider.complete({
          messages: context,
          tools: this.tools,
        });
        
        // 4. Execute tools if needed
        const toolResults = yield* this.executeTools(response.toolCalls);
        
        // 5. Append to session
        yield* session.appendEntry(response.message);
        yield* session.recordUsage(response.usage);
        yield* session.appendEvent({
          type: "model_response",
          sessionId,
          content: response.content,
          toolCalls: response.toolCalls,
        });
        
        return { message: response, toolResults };
      })
    );
  }
}
```

### Step 5: 实现 Agent Graph (Subagent)

基于 MAKA 的 Copy-on-Write 设计：

```typescript
// src/agent-graph.ts
class AgentGraph {
  constructor(
    private runtime: RuntimeKernel,
    private sessionManager: SessionManager,
  ) {}
  
  async scheduleTask(task: Task): Promise<Result> {
    // 1. Create sub-session (CoW)
    const subSession = await this.sessionManager.fork(
      parentSessionId,
      task.name,
      { task: task.spec }
    );
    
    // 2. Run in runtime
    const result = await this.runtime.runTurn(subSession.id);
    
    // 3. Aggregate result
    return this.aggregateResult(result);
  }
}
```

---

## 4. API 设计

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /health` | GET | Health check |
| `POST /api/session` | POST | Create session |
| `GET /api/session/:id` | GET | Get session |
| `POST /api/session/:id/message` | POST | Append message |
| `POST /api/session/:id/turn` | POST | Run one turn |
| `POST /api/session/:id/fork` | POST | Fork session |
| `GET /api/session/:id/events` | GET | Get event log |
| `POST /api/tool/execute` | POST | Execute tool |

### Request/Response

```typescript
// Create session
POST /api/session
{
  "name": "my-session",
  "model": "openrouter/anthropic/claude-sonnet-4"
}
→ {
  "id": "uuid",
  "name": "my-session",
  "createdAt": "ISO8601"
}

// Append message
POST /api/session/:id/message
{
  "content": "Hello!",
  "role": "user"
}
→ {
  "id": "uuid",
  "sessionId": "uuid",
  "content": "Hello!",
  "role": "user",
  "ts": 1234567890
}

// Run turn
POST /api/session/:id/turn
{
  "maxTokens": 4096,
  "temperature": 0.7
}
→ {
  "message": {
    "id": "uuid",
    "content": "Hello! How can I help?",
    "role": "assistant"
  },
  "usage": {
    "inputTokens": 100,
    "outputTokens": 50,
    "cost": 0.001
  },
  "toolCalls": []
}
```

---

## 5. 实现文件

```
sec-cell/
├── src/
│   ├── index.ts           (CF Worker 入口)
│   ├── session-actor.ts   (Session Actor)
│   ├── storage.ts         (Storage 抽象)
│   ├── runtime-kernel.ts (Runtime Kernel)
│   ├── agent-graph.ts     (Agent Graph)
│   ├── effect-tools.ts    (Effect Tools)
│   └── api.ts             (API handlers)
├── .celld/
│   └── dev/
│       ├── objects.sqlite3
│       └── runtime/
├── package.json
└── wrangler.jsonc
```

---

## 6. 下一步

1. ✅ celld dev 运行正常
2. ⬜ 实现 Session Actor
3. ⬜ 集成 Effect Agent
4. ⬜ 实现 Runtime Kernel
5. ⬜ 实现 Agent Graph
6. ⬜ 测试完整流程

---

## 7. 参考文档

| 文档 | 位置 |
|------|------|
| ARCHITECTURE.md | docs/ARCHITECTURE.md |
| PI vs MAKA | docs/PI-VS-MAKA.md |
| CELLD vs RIVET | docs/CELLD-VS-RIVET.md |
| ACTOR HONEST | docs/ACTOR-HONEST.md |
| CORE ARCHITECTURE | docs/CORE-ARCHITECTURE.md |
