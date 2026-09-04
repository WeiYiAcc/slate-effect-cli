# PI vs MAKA: 后端 Actor 模型对比

> 基于 pi 仓库 `packages/server/src/` 和 `packages/agent/docs/harness.md`，与 maka 的 `packages/runtime` 和 `docs/architecture/runtime-core` 的逐层对比。

---

## 1. 整体架构对比

### PI 后端（重构版）

```
┌─────────────────────────────────────────────────────────────┐
│              pi packages/server/                            │
├─────────────────────────────────────────────────────────────┤
│  Server (server.ts)                                          │
│  ├── ServerListener (listener.ts) - 传输层                 │
│  ├── SessionRouter (session-router.ts) - session 路由      │
│  ├── ConnectionState Set - 活跃连接                       │
│  └── ServerHost (types.ts) - 应用能力接口                  │
│                                                              │
│  RoutedSessionHandle / RoutedSessionAttachment             │
│  └── Chord (facet-service) - 传输层                       │
└─────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│              pi packages/agent/                              │
├─────────────────────────────────────────────────────────────┤
│  Agent (AgentHarness) - agent 核心                          │
│  ├── Session (三个 store)                                   │
│  │   ├── entries - write-once                              │
│  │   ├── values/lists - mutable                            │
│  │   └── usage - append-only                                │
│  ├── Operation state machine (13 leaves)                   │
│  ├── AgentLane - 公共接口                                   │
│  │   ├── accept(request)                                   │
│  │   ├── drive()                                           │
│  │   ├── requestAbort()                                    │
│  │   └── inspectExecution()                                │
│  └── Branch (named lane)                                   │
└─────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│              pi packages/ai/                                 │
├─────────────────────────────────────────────────────────────┤
│  Model provider (Anthropic/OpenAI/OpenRouter...)            │
│  Stream, Context, Tools                                     │
└─────────────────────────────────────────────────────────────┘
```

### MAKA 后端

```
┌─────────────────────────────────────────────────────────────┐
│              @maka/runtime-host (single authority)          │
├─────────────────────────────────────────────────────────────┤
│  Runtime Host                                                │
│  ├── SessionManager - session/turn 编排                    │
│  ├── AgentRun + RuntimeKernel - agent 执行                  │
│  ├── Tool Runtime - tool 执行                              │
│  ├── Permission System                                      │
│  └── Event Log projection (UI/Context/Recovery)           │
└─────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│              @maka/runtime                                   │
├─────────────────────────────────────────────────────────────┤
│  SessionManager, AgentRun, model adapters, tools            │
│  RuntimeKernel, runtime events, projections, recovery      │
│  Agent Graph (subagent scheduling)                          │
└─────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│              @maka/storage + @maka/core                      │
├─────────────────────────────────────────────────────────────┤
│  SQLite control plane                                       │
│  Pure contracts: Session, RuntimeEvent, AgentRun           │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Actor 模型对比

### 维度 1: 进程/隔离模型

| 维度 | PI | MAKA |
|------|-----|------|
| **隔离单元** | AgentLane (逻辑隔离) | AgentRun (单进程) |
| **状态容器** | Session (三个 store) | RuntimeEvent Log |
| **消息模型** | Chord service call | RuntimeEvent + Service call |
| **状态位置** | entries/values/usage 三表 | RuntimeEvent Log (单一 append-only) |

### 维度 2: Session 生命周期

**PI** (RoutedSessionHandle from types.ts):
```typescript
interface RoutedSessionHandle {
  attachClient(context: Context): MaybePromise<RoutedSessionAttachment>;
  readonly terminated?: Promise<Error | undefined>;
  close(context: Context): Promise<void>;
}

interface RoutedSessionAttachment {
  invokeService(call, publish, context): Promise<JsonValue | undefined>;
  release(context): MaybePromise<void>;
}
```

**MAKA** (SessionManager):
- Session 创建 → AgentRun → RuntimeKernel
- 单次执行 → RuntimeEvent Log 记录
- Agent Run = Runtime + Tools + Context

### 维度 3: 多客户端支持

**PI** (强):
- `SessionRouter.hostedSessions`: Map<sessionId, HostedSession>
- `ClientAttachment`: 单客户端订阅单 session
- `attachmentsByClient`: Map<client, ClientAttachment>
- 支持多客户端订阅同一 session

**MAKA** (弱):
- Runtime Host 是 single authority
- 一个 session 通常对应一个 client
- 跨 session 通信通过 Event Log 投影

### 维度 4: 会话状态

**PI** (Session三个 Store):
```
entries  - write-once conversation tree
values   - mutable state
usage    - append-only cost ledger
```

**MAKA** (RuntimeEvent Log):
```
单一 append-only log
projection: UI/Context/Recovery
```

**关键区别**：
- PI 显式三个 store，read 模型 vs write 模型分开
- MAKA 单一 log，所有状态都是 log 的 projection

---

## 3. 路由模型对比

### PI: SessionRouter

```typescript
class SessionRouter<TMetadata> {
  // session 表
  private readonly hostedSessions = new Map<string, HostedSession>();
  private readonly openingSessions = new Map<string, Promise<HostedSession>>();
  
  // 路由 service call
  async executeServiceCall(call, target, client, publish, context): Promise<JsonValue | undefined> {
    const admitted = await this.runForClient(client, () =>
      this.startServiceCall(client, target, call, publish, context),
    );
    return admitted.result;
  }
  
  // 客户端 attach/detach
  attachClient(client, sessionId, context): Promise<void>;
  detachClient(client, context): Promise<void>;
}
```

**特点**：
- 集中式 session 路由器
- 每个客户端可 attach 到多个 session
- session 生命周期管理
- service call 路由

### MAKA: Runtime Host

```typescript
// makai 没有显式的 session router
// Runtime Host 直接管理 SessionManager
// Session 状态通过 RuntimeEvent Log 投影
```

**特点**：
- 单一权威 (Runtime Host)
- Session 状态从 log 投影
- 没有显式 router
- Agent Graph 处理多 agent

---

## 4. 状态管理对比

### PI: 三个 Store

| Store | 用途 | 例子 |
|-------|------|------|
| `entries` | write-once conversation tree | messages, tool results, compactions |
| `values` | mutable session state | name, model, branch, operation state |
| `usage` | append-only cost | tokens, cost per request |

```typescript
// pi harness
class AgentHarness {
  // entries
  appendEntry(entry: Entry): Promise<void>;
  // values
  setValue(key, value): Promise<void>;
  getValue<T>(key): Promise<T | undefined>;
  // usage
  recordUsage(usage: Usage): Promise<void>;
}
```

### MAKA: 单一 Log

| 字段 | 用途 |
|------|------|
| `id`, `ts` | 身份/时间 |
| `sessionId`, `runId`, `turnId` | 上下文 |
| `type` | event 类型 |
| `payload` | event 数据 |
| `metadata` | 元数据 |

```typescript
// maka runtime event
type RuntimeEvent =
  | { type: 'session_start', sessionId, ts, ... }
  | { type: 'user_message', sessionId, content, ... }
  | { type: 'model_response', sessionId, content, toolCalls, ... }
  | { type: 'tool_execution', sessionId, toolName, args, result, ... }
  | { type: 'permission_request', sessionId, action, ... }
  | { type: 'session_end', sessionId, outcome, ... };
```

**关键区别**：
- PI: 三个 store，按数据特性分类存储
- MAKA: 一个 log，按时间序列存储

---

## 5. 操作状态机对比

### PI: 13 leaves Operation State Machine

```typescript
// pi harness Part 3
type OperationState =
  | 'starting'
  | 'checkpoint'
  | 'assistant.ready'
  | 'assistant.effect_pending'
  | 'tools'
  | 'summary.deciding'
  | 'summary.ready'
  | 'navigation.ready_to_commit'
  | ... (13 个 leaf state)
```

**特点**：
- 显式 state machine
- 每个 leaf 都是可恢复的检查点
- `accept`/`drive` 驱动 state 转换
- `requestAbort` 中断

### MAKA: RuntimeKernel

```typescript
// maka 没有显式 state machine
// Agent Run = 一次完整执行
// 状态通过 Event Log 投影
```

**特点**：
- 隐式 state via log
- 没有显式 transition
- 一次执行 = 一次 log 序列

---

## 6. 多 Agent 调度对比

### PI: Branch + Fork

```typescript
// pi harness 2.3 Branches and AgentLanes
class Branch {
  readonly id: string;
  readonly name: string;
  readonly tip: EntryId;
  
  // fork 出一个新 branch
  fork(name: string, from: EntryId): Promise<Branch>;
}
```

**特点**：
- Branch 是 AgentLane 的逻辑单元
- Fork 创建新的 conversation tree 分支
- 每个 branch 有自己的 tip

### MAKA: Agent Graph

```typescript
// maka 2 paths: CoW vs Mailboxes
// maka 选择 CoW (Workflow Graph)
class AgentGraph {
  async schedule(tasks: Task[]): Promise<Result[]> {
    // 拓扑排序
    // 并行执行无依赖任务
    // subagent 不继承父 agent 对话
  }
}
```

**特点**：
- Task Graph + Copy-on-Write
- 显式 task specification
- 父子 agent 独立 context

---

## 7. 后端架构关键技术对比

### PI 关键技术栈

| 组件 | 技术 | 文件 |
|------|------|------|
| **Server** | TypeScript | packages/server/src/server.ts |
| **Session 路由** | TypeScript Map | session-router.ts |
| **存储** | SQLite/JSONL/Memory | harness.md § 1.7 |
| **传输** | Chord (facet-service) | packages/chord |
| **协议** | JSON-RPC over WS/HTTP | packages/protocol |
| **Agent** | TypeScript class | packages/agent |
| **Model** | TypeScript + Stream | packages/ai |

### MAKA 关键技术栈

| 组件 | 技术 | 位置 |
|------|------|------|
| **Runtime Host** | Node.js + TypeScript | packages/runtime-host |
| **Session** | Node.js class | packages/runtime |
| **存储** | SQLite | packages/storage |
| **传输** | SSE + WebSocket | (内部实现) |
| **协议** | JSON RPC + Event | (内部实现) |
| **Agent** | Node.js + Effect | packages/runtime |
| **Model** | AI SDK | @maka/ai-sdk-backend |

---

## 8. Actor 模型实现的真正区别

### PI 的 Actor-like 特性

1. **多客户端订阅同一 Session** (类似 Actor + PubSub)
   - `SessionRouter.hostedSessions` 允许多个 ClientAttachment
   - 同一 session 可被多客户端订阅

2. **显式 state machine**
   - 13 leaves state machine
   - accept/drive/abort 操作

3. **三个 store 分离**
   - entries (immutable)
   - values (mutable)
   - usage (append-only)

4. **Branch + Fork**
   - 类似 Actor 的 spawn
   - 每个 branch 是独立执行线

### MAKA 的 Actor-like 特性

1. **Runtime Host 单权威**
   - 单一执行权威
   - 没有 client multi-attach

2. **Log Is the Runtime**
   - 状态 = log 投影
   - 没有显式 state machine

3. **Append-only Log**
   - 所有状态都在 log
   - UI/Context 都是 projection

4. **Agent Graph (CoW)**
   - subagent 是 task-scoped tools
   - 父子 agent 独立 context

### 关键差异总结

| 维度 | PI | MAKA |
|------|-----|------|
| **Session 多客户端** | ✅ 支持 | ❌ 单权威 |
| **State 显式建模** | ✅ state machine | ❌ log 投影 |
| **数据分层** | ✅ 三 store | ❌ 单一 log |
| **Subagent 调度** | Branch fork | Agent Graph |
| **Recovery** | state machine 恢复 | log replay |
| **多租户** | ❌ 弱 | ✅ Runtime Host |
| **Context 投影** | branch context | log projection |

---

## 9. sec v3 应该采用哪个

### 选择: PI 的 Session Router + MAKA 的 Runtime Event Log

```
sec v3 = PI 的 Session 路由能力 + MAKA 的 Event Log 状态管理
```

### 具体实现

```
┌─────────────────────────────────────────────────────────────┐
│                   sec v3 Runtime                            │
├─────────────────────────────────────────────────────────────┤
│  Session Router (PI 风格)                                   │
│  ├── hostedSessions Map<sessionId, HostedSession>          │
│  ├── attachmentsByClient Map<client, ClientAttachment>    │
│  └── multi-client attachment 支援                          │
│                                                              │
│  Runtime Event Log (MAKA 风格)                              │
│  ├── append-only event stream                              │
│  ├── projection: UI / Context / Recovery                   │
│  └── runtime event types                                   │
│                                                              │
│  Session Store (PI 三 store)                                │
│  ├── entries (write-once)                                   │
│  ├── values (mutable)                                       │
│  └── usage (append-only)                                   │
│                                                              │
│  Agent Graph (MAKA CoW)                                     │
│  ├── task decomposition                                     │
│  ├── subagent as tool                                       │
│  └── Copy-on-Write context                                 │
│                                                              │
│  Operation State Machine (PI 13 leaves)                    │
│  ├── accept / drive / abort                                │
│  └── state transition                                      │
└─────────────────────────────────────────────────────────────┘
```

### 为什么这样组合

1. **Session Router 来自 PI**: 多客户端订阅同一 session 能力
2. **Event Log 来自 MAKA**: 简化状态管理
3. **三 store 来自 PI**: 清晰的数据分层
4. **Agent Graph 来自 MAKA**: 避免 context 污染
5. **State Machine 来自 PI**: 显式 state 转换

---

## 10. 总结

| 维度 | PI 后端 | MAKA 后端 | sec v3 |
|------|---------|-----------|--------|
| **语言** | TypeScript | Node.js + Rust 部分 | TypeScript |
| **进程模型** | Node.js (单进程) | Node.js (单进程) | V8 Isolates |
| **状态存储** | 三 store | 单一 Event Log | 三 store + Event Log |
| **多客户端** | ✅ SessionRouter | ❌ Runtime Host | ✅ SessionRouter |
| **State 显式** | ✅ 13 leaves | ❌ log 投影 | ✅ 13 leaves |
| **Subagent** | Branch fork | Agent Graph (CoW) | Agent Graph |
| **Recovery** | state 恢复 | log replay | state 恢复 |
| **传输层** | Chord | SSE/WS | Chord |

### sec v3 关键设计

```typescript
// sec v3 关键类型
interface SecSession {
  // PI 风格: 三 store
  entries: Entry[];      // write-once conversation
  values: Map<string, any>;  // mutable state
  usage: UsageRecord[];  // append-only cost
  
  // MAKA 风格: Event Log
  eventLog: RuntimeEvent[];
  
  // 状态机
  operationState: OperationState;
}

interface SecSessionRouter {
  // PI 风格: 多客户端
  hostedSessions: Map<string, HostedSession>;
  attachmentsByClient: Map<object, ClientAttachment>;
}

interface SecAgentGraph {
  // MAKA 风格: CoW subagent
  schedule(tasks: Task[]): Promise<Result[]>;
  spawnSubagent(task: Task): Promise<Subagent>;
}
```
