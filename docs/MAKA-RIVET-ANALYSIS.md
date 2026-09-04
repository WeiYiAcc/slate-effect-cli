# Apache Maka & Rivet Actor 模型分析

## 1. Apache Maka 概览

**Apache Maka (Incubating)** = 高性能 agent workspace，用 append-only Runtime Event Log 管理 agent 状态

- 官网: https://maka.apache.org/
- 仓库: https://github.com/apache/maka
- 状态: Apache 孵化器项目
- 技术栈: Node.js 22+ / Rust / SQLite / Electron

### 核心设计哲学

**Log Is the Runtime**

```
State(t) = Project(RuntimeEvents[0..t], policy, runtime configuration)
```

Runtime Event Log 是所有状态的语义来源，Session/Run/UI/Recovery 都是 Log 的投影。

### 技术栈

| 组件 | 实现 |
|------|------|
| **Runtime** | Node.js + V8 (无 V8 Isolates) |
| **Storage** | SQLite (事件 log + 状态) |
| **Native** | Rust (ripgrep, performance) |
| **UI** | Electron (Desktop + TUI + CLI) |
| **Eval** | 自研 benchmark framework |

### maka packages

| Package | 角色 |
|---------|------|
| `packages/core` | 纯合约 (Session, RuntimeEvent, AgentRun) |
| `packages/storage` | SQLite 存储 + 控制平面 |
| `packages/runtime` | SessionManager, AgentRun, model adapters |
| `packages/runtime-host` | 唯一执行权威 + 公共协议 |
| `packages/eval` | 实验评估 |
| `packages/cli` | TUI, `maka run`, `maka eval` |
| `packages/computer-use` | Computer use capabilities |
| `apps/desktop` | Electron Desktop |

### BEAM/OTP 等价

| Elixir/OTP | maka 等价 |
|------------|----------|
| GenServer | Runtime Kernel |
| OTP Supervision | Runtime Host (单一权威) |
| Phoenix Presence | Runtime Event Log projection |
| Phoenix PubSub | SSE + WebSocket |
| Agent Registry | SessionManager |
| ETS | SQLite |
| Process Dictionary | RuntimeEvent |

### maka 的 Actor 模型

**没有传统的 Actor 模型**，而是采用：

1. **Single Authority** - Runtime Host 是唯一执行权威
2. **Event Log** - 所有状态都是事件 log 的投影
3. **Subagent as Tool** - subagent 不继承父 agent 对话
4. **Copy-on-Write Context** - 显式 context 传递

### maka 的多 Agent 调度

**两种路径对比**：

| 路径 | 代表 | 特点 |
|------|------|------|
| **Copy-on-Write (Workflow Graph)** | maka | 显式 task spec，无 mailbox |
| **Mailboxes (Message-Driven)** | Codex | 地址 + 私有 mailbox，异步消息 |

maka 选择 CoW 路径：

```text
Main Agent ── task ──> Subagent
Main Agent <── result ── Subagent
```

---

## 2. Rivet / agentos Actor 实现

### Rivet crates

| Crate | 角色 |
|-------|------|
| `actor-uds-client` | Unix Domain Socket actor 客户端 |
| `kernel` | 核心 kernel |
| `runtime` | Runtime 管理 |
| `v8-runtime` | V8 isolate runtime |
| `execution` | 执行引擎 |
| `agentos-protocol` | ACP 协议 |
| `agentos-sidecar` | Sidecar 实现 |

### Rivet/agentos vs BEAM/OTP

| BEAM/OTP | rivet/agentos | 评价 |
|----------|--------------|------|
| BEAM 进程 | V8 Isolates | V8 比 BEAM 重 |
| OTP Supervision | 无 | 需要自己实现 |
| GenServer | Agent Runtime | 类似但不等价 |
| Registry | SessionManager | 类似 |
| Phoenix PubSub | ACP Protocol | 协议不同 |
| ETS | D1/SQLite | 存储不同 |
| Phoenix Presence | 需要自己实现 | 无原生 |
| 进程调度 | V8 isolate 调度 | 更重 |

### Rivet 的限制

1. **V8 Isolates 比 BEAM 重** - 内存开销更大，启动时间更慢
2. **无原生 Supervision** - 需要自己实现故障恢复
3. **单进程模型** - 扩展性不如分布式 BEAM
4. **无 Presence** - 需要自己实现 presence tracking

### Rivet 的优势

1. **V8 Isolates 隔离性好** - 类似 Linux 进程隔离
2. **ACP Protocol 标准化** - 跨 agent 通信协议
3. **支持多 agent runtime** - Pi/Claude/Codex
4. **Rivetkit 框架** - 提供 API 和 bindings

---

## 3. BEAM/OTP 替代方案对比

### 框架对比

| 方案 | 进程模型 | Supervision | 消息传递 | 状态管理 | 语言 |
|------|---------|-------------|---------|---------|------|
| **BEAM/OTP** | 百万级轻量进程 | 原生监督树 | Mailbox | ETS/持久化 | Elixir |
| **Jido** | GenServer | OTP | Signal | D1/KV | Elixir |
| **maka** | Node workers | Runtime Host | SSE | SQLite + Event Log | Node.js |
| **rivet/agentos** | V8 Isolates | 无 | ACP | D1/SQLite | TypeScript/Rust |
| **pi** | Node.js | 无 | chord | SQLite | TypeScript |
| **celld** | 分布式节点 | 无 | HTTP/WS | D1/KV/Queue | Go |

### 各方案详细分析

#### BEAM/OTP (黄金标准)
- ✅ 百万级轻量进程
- ✅ 原生 OTP Supervision
- ✅ Mailbox 消息传递
- ✅ 热代码升级
- ❌ 语言门槛 (Elixir/Erlang)

#### Jido
- ✅ 基于 BEAM/OTP
- ✅ Formalized Agent Pattern
- ✅ Signal (CloudEvents 兼容)
- ✅ AI integration via ReqLLM
- ❌ Elixir 生态较小

#### maka
- ✅ Runtime Event Log 设计优秀
- ✅ Copy-on-Write Context
- ✅ Agent Graph 调度
- ✅ 完整的 eval framework
- ❌ 无传统 actor 模型
- ❌ 依赖 Electron

#### rivet/agentos
- ✅ V8 Isolates 隔离
- ✅ ACP Protocol 标准化
- ✅ 多 agent runtime
- ❌ 无 OTP Supervision
- ❌ V8 比 BEAM 重

#### pi (earendil-works)
- ✅ chord (facet-service) 设计好
- ✅ 11 个 packages 完整
- ✅ 轻量 Node.js
- ❌ 无 Supervision
- ❌ 功能相对较少

#### celld
- ✅ 分布式 Durable Objects
- ✅ 多后端 (S3/Cloudflare D1/Azure)
- ✅ Peer 网络
- ❌ 只是存储，不是 runtime
- ❌ 不是 actor framework

---

## 4. sec v3 架构：整合所有框架

### 目标

```
sec v3 = 一个完整的本地 agent workspace

整合：
- maka 的 Runtime Event Log 设计
- rivet/agentos 的 V8 Runtime + ACP
- pi 的 chord (facet-service)
- Effect Agent 的 Tool.make()
- celld 的存储
- Jido 的 Signal pattern
```

### 完整架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Runtime Host (maka 风格)                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Runtime Event Log (append-only)             │ │
│  │   Session / Run / Tool / Permission / Termination       │ │
│  │   Projection: UI / Context / Recovery                   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              SessionManager (maka 风格)                   │ │
│  │   - Session lifecycle                                   │ │
│  │   - Turn orchestration                                  │ │
│  │   - Agent spawn/terminate (类似 GenServer)              │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Agent Graph (maka Copy-on-Write)            │ │
│  │   - Task decomposition                                  │ │
│  │   - Subagent spawning (task-scoped tools)                │ │
│  │   - Result aggregation                                  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Runtime Kernel (Effect Agent)              │ │
│  │   - Model loop (类似 BEAM process)                       │ │
│  │   - Tool execution                                      │ │
│  │   - Context management                                  │ │
│  │   - Recovery (crash-safe)                                │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Tool Registry (Tool.make())                 │ │
│  │   - Filesystem (WorkspaceExecutor)                      │ │
│  │   - Shell (Bash)                                        │ │
│  │   - Search (Grep)                                       │ │
│  │   - Custom tools (Effect Schema)                        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              ACP Protocol (rivet)                        │ │
│  │   - Agent间通信                                          │ │
│  │   - Provider bridges                                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Storage (celld + SQLite)                    │ │
│  │   - Sessions (SQLite via pi-session-backend)           │ │
│  │   - KV (D1/celld)                                       │ │
│  │   - Queue (celld)                                       │ │
│  │   - Bucket (S3/celld)                                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 各层使用的框架

| 层 | 实现 | 借鉴自 |
|----|------|--------|
| **Runtime Host** | Node.js + TypeScript | maka |
| **Event Log** | SQLite append-only table | maka |
| **SessionManager** | pi-agent-core + extends | pi + maka |
| **Agent Graph** | Task Graph + CoW | maka |
| **Runtime Kernel** | Effect Agent | effect-agent |
| **Tools** | Tool.make() | effect-agent |
| **ACP** | agentos-protocol | rivet |
| **Storage** | celld + SQLite | celld + pi |
| **Signal** | CloudEvents | Jido + pi-chord |

### 实现步骤

```
Phase 1: Runtime Event Log (借鉴 maka)
  - Event schema definition (RuntimeEvent)
  - SQLite append-only log table
  - Projection system (UI / Context / Recovery)

Phase 2: SessionManager (借鉴 maka + pi)
  - Session/Run/Turn lifecycle
  - Agent spawn/terminate
  - Permission system
  - Event emission

Phase 3: Runtime Kernel (Effect Agent)
  - Model loop with Effect
  - Tool execution via Tool.make()
  - Context management
  - Recovery from log

Phase 4: Agent Graph (借鉴 maka Copy-on-Write)
  - Task decomposition
  - Subagent spawning (task-scoped)
  - Result aggregation
  - Workflow scheduler

Phase 5: ACP Protocol (rivet)
  - Agent间通信
  - Provider bridges (Telegram/Discord/Email)
  - External subject integration

Phase 6: celld Integration
  - Sessions to celld D1
  - KV for state
  - Queue for async work
  - Bucket for artifacts

Phase 7: UI 集成
  - SSE 实时更新
  - 复用现有 UI 产品
  - Signal 路由
```

### 关键设计决策

#### 1. 采用 maka 的 Runtime Event Log
```typescript
// Event types
type RuntimeEvent = 
  | { type: 'session_start', sessionId, ts, ... }
  | { type: 'user_message', sessionId, content, ... }
  | { type: 'model_response', sessionId, content, toolCalls, ... }
  | { type: 'tool_execution', sessionId, toolName, args, result, ... }
  | { type: 'permission_request', sessionId, action, ... }
  | { type: 'session_end', sessionId, outcome, ... };

// State is projection
function projectState(events: RuntimeEvent[]): State {
  return {
    conversation: buildConversation(events),
    toolHistory: buildToolHistory(events),
    outcome: classifyTerminal(events),
    context: buildContext(events),
  };
}
```

#### 2. 采用 rivet/agentos 的 V8 Runtime
- V8 Isolates 作为 agent 隔离
- ACP Protocol 作为 agent 间通信
- 支持 Pi/Claude/Codex agents

#### 3. 采用 pi 的 chord (facet-service)
- Transport-neutral service composition
- Plugin 系统
- 可扩展架构

#### 4. 保留 Effect Agent 的 Tool.make()
- Schema-first tool 定义
- 类型安全的 tool composition
- Effect Layer 作为 AI Provider

#### 5. 自己实现 Supervision（maka 风格）
- Runtime Host 作为单一权威
- SessionManager 管理生命周期
- Agent Graph 处理多 agent 调度

---

## 5. 借鉴 maka 的关键设计

### Runtime Event Log 模式

```typescript
// 事件结构
interface RuntimeEvent {
  id: string;
  sessionId: string;
  invocationId: string;
  runId: string;
  turnId: string;
  branch: string;
  ts: number;
  type: 'user' | 'model' | 'tool' | 'permission' | 'terminal';
  payload: any;
  metadata: any;
}

// Append-only log
class EventLog {
  async append(event: RuntimeEvent): Promise<void>;
  async query(filter: EventFilter): Promise<RuntimeEvent[]>;
  async project<T>(projector: (events: RuntimeEvent[]) => T): Promise<T>;
}
```

### Copy-on-Write Context

```typescript
class AgentContext {
  // Subagent 不继承完整历史
  static createSubagent(
    parent: AgentContext,
    task: TaskSpec
  ): AgentContext {
    return {
      ...parent.runtime,
      conversation: [], // 独立对话
      task: task,        // 显式 task
      tools: task.tools, // 受限工具集
    };
  }
}
```

### Agent Graph 调度

```typescript
class AgentGraph {
  async schedule(tasks: Task[]): Promise<Result[]> {
    // 拓扑排序
    const sorted = topologicalSort(tasks);
    
    // 并行执行无依赖的任务
    for (const batch of groupByDependency(sorted)) {
      await Promise.all(
        batch.map(task => this.executeTask(task))
      );
    }
  }
  
  async executeTask(task: Task): Promise<Result> {
    // 创建 subagent (CoW)
    const subagent = AgentContext.createSubagent(this.context, task);
    return await subagent.run();
  }
}
```

---

## 6. 总结

### BEAM/OTP 替代品选择

| 场景 | 推荐方案 |
|------|---------|
| **本地轻量 agent** | sec v3 (Effect Agent + celld + agentos) |
| **云端多租户** | multica (celld + agentos + ACP) |
| **企业级 workspace** | maka (Node.js + Runtime Event Log) |
| **Elixir 生态** | Jido (基于 BEAM/OTP) |
| **V8 隔离** | rivet/agentos |

### sec v3 的独特价值

不是重复造轮子，而是整合最佳特性：

1. **maka** 的 Runtime Event Log - 状态来源设计
2. **rivet/agentos** 的 V8 Runtime - agent 隔离
3. **pi** 的 chord (facet-service) - 传输层
4. **Effect Agent** 的 Tool.make() - 类型安全 tool
5. **celld** 的存储 - 分布式持久化
6. **Jido** 的 Signal pattern - CloudEvents 兼容

sec v3 = 一个完整的本地 agent workspace，借鉴所有框架的最佳实践。
