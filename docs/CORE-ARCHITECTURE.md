# sec v3 核心架构: Effect + celld (SQLite)

> **核心观点**: celld 是必须的（CF DO 支持），Effect + SQLite 是最重要的基础，其他东西围绕这两个设计。

---

## 1. 为什么 celld 是必须的

### Cloudflare Durable Objects (CF DO)

celld = self-hosted distributed Durable Objects

```typescript
// celld 支持多种后端
celld --bucket s3://NAME        // AWS S3
celld --bucket gs://NAME       // Google Cloud Storage
celld --bucket az://NAME       // Azure Blob
celld --bucket                // 本地文件系统
```

**关键特性**：
- **KV Namespace** - 键值存储
- **D1** - SQLite 数据库
- **Queue** - 消息队列
- **Bucket** - S3/GS/AZ 对象存储
- **Peer** - P2P 节点发现

### 为什么必须

1. **CF DO 部署** - 需要分布式存储
2. **多实例** - 单机不够用
3. **数据一致性** - D1 提供 ACID
4. **队列** - 异步任务处理

---

## 2. Effect + SQLite 是最重要的基础

### 为什么是 Effect

| 特性 | 说明 |
|------|------|
| **类型安全** | Schema-first tool 定义 |
| **Effect Layer** | Provider 解耦 |
| **Composition** | 函数式组合 |
| **Error Handling** | 类型化的错误处理 |

### 为什么是 SQLite

| 特性 | 说明 |
|------|------|
| **ACID** | 原子性、一致性、隔离性、持久性 |
| **性能** | 嵌入式，高性能 |
| **生态** | celld D1 = SQLite 兼容 |
| **工具** | 大量 SQLite 工具 |

### SQLite vs 其他存储

| 存储 | 优点 | 缺点 |
|------|------|------|
| **SQLite** | ACID、嵌入式、性能 | 单机 |
| **D1** | Cloudflare 托管 | 有延迟 |
| **celld KV** | 分布式 | 不支持复杂查询 |
| **S3** | 海量存储 | 无事务 |

---

## 3. Effect + celld 的组合

### 架构

```
┌─────────────────────────────────────────────────────────────┐
│              Effect Layer                                     │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Tool.make() - Schema-first tool 定义                   │ │
│  │  Provider Layer - AI Provider 解耦                      │ │
│  │  Effect Runtime - 类型安全的 Effect 执行                 │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              celld Storage Layer                              │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  SQLite (via D1 compatible API)                        │ │
│  │  ├── Sessions table                                   │ │
│  │  ├── Entries table (conversation tree)                │ │
│  │  ├── Values table (mutable state)                    │ │
│  │  ├── Usage table (append-only)                       │ │
│  │  └── Events table (runtime events)                   │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  KV Namespace                                         │ │
│  │  ├── Session metadata                                 │ │
│  │  ├── Agent state                                      │ │
│  │  └── Cache                                           │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Queue                                                │ │
│  │  ├── Task queue                                       │ │
│  │  └── Event queue                                      │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 实现

```typescript
// 1. SQLite schema for Effect tools
const schema = Effect.Schema.Struct({
  sessionId: Effect.Schema.String,
  messages: Effect.Schema.Array(MessageSchema),
  tools: Effect.Schema.Array(ToolSchema),
  usage: UsageSchema,
});

// 2. celld D1 compatible storage
class SecStorage {
  async query(sql: string, params: any[]): Promise<any[]>;
  async execute(sql: string, params: any[]): Promise<void>;
  
  // Sessions
  async createSession(session: Session): Promise<void>;
  async getSession(id: string): Promise<Session | null>;
  
  // Entries (conversation tree)
  async appendEntry(sessionId: string, entry: Entry): Promise<void>;
  async getEntries(sessionId: string): Promise<Entry[]>;
  
  // Values (mutable)
  async setValue(sessionId: string, key: string, value: any): Promise<void>;
  async getValue<T>(sessionId: string, key: string): Promise<T | null>;
  
  // Usage (append-only)
  async recordUsage(sessionId: string, usage: Usage): Promise<void>;
  
  // Events (runtime)
  async appendEvent(sessionId: string, event: RuntimeEvent): Promise<void>;
}

// 3. Effect tool using SQLite storage
const createSessionTool = Tool.make(
  {
    name: "create_session",
    description: "Create a new session",
    parameters: schema.pipe(Effect.Schema.sign),
  },
  (args: { name: string; model: string }) =>
    Effect.gen(function* () {
      const session: Session = {
        id: randomUUID(),
        name: args.name,
        model: args.model,
        createdAt: Date.now(),
      };
      yield* Effect.flatMap(
        SecStorage,
        (storage) => storage.createSession(session)
      );
      return session;
    })
);
```

---

## 4. 其他组件围绕 Effect + celld 构建

### 组件依赖

```
Effect + celld (基础)
       │
       ├── Runtime Kernel (基于 Effect)
       │     │
       │     ├── Model Loop
       │     ├── Tool Execution
       │     └── Context Management
       │
       ├── Session Manager (基于 celld)
       │     │
       │     ├── Session lifecycle
       │     ├── Turn orchestration
       │     └── State persistence
       │
       ├── Agent Graph (基于 Session Manager)
       │     │
       │     ├── Task decomposition
       │     ├── Subagent spawning
       │     └── Result aggregation
       │
       ├── Protocol Layer (基于 Effect)
       │     │
       │     ├── ACP Protocol
       │     ├── HTTP/REST
       │     └── WebSocket
       │
       └── UI Layer (基于 Protocol)
             │
             ├── CLI (sec)
             ├── TUI
             └── Web UI
```

### 各层实现

#### Layer 1: Effect + celld (不变)

```typescript
// 最基础的层，不依赖其他层
interface SecStorage {
  // SQLite operations
  query<T>(sql: string, params: any[]): Effect.Effect<T[]>;
  execute(sql: string, params: any[]): Effect.Effect<void>;
}

// celld D1 compatible implementation
class CelldStorage implements SecStorage {
  constructor(private engine: Engine) {}
  
  query<T>(sql: string, params: any[]): Effect.Effect<T[]> {
    return Effect.sync(() => {
      return this.engine.query(sql, params);
    });
  }
  
  execute(sql: string, params: any[]): Effect.Effect<void> {
    return Effect.sync(() => {
      this.engine.execute(sql, params);
    });
  }
}
```

#### Layer 2: Runtime Kernel (依赖 Layer 1)

```typescript
// 基于 Effect 的 Runtime Kernel
class RuntimeKernel {
  constructor(
    private storage: SecStorage,
    private modelProvider: ModelProvider,
  ) {}
  
  // Model loop using Effect
  async runTurn(sessionId: string): Promise<void> {
    return Effect.runPromise(
      Effect.gen(function* () {
        // 1. Load session from storage
        const session = yield* this.loadSession(sessionId);
        
        // 2. Build context
        const context = yield* this.buildContext(session);
        
        // 3. Call model
        const response = yield* this.modelProvider.complete(context);
        
        // 4. Execute tools if needed
        const result = yield* this.executeTools(response.toolCalls);
        
        // 5. Persist to storage
        yield* this.persistTurn(session, response, result);
      })
    );
  }
}
```

#### Layer 3: Session Manager (依赖 Layer 1 + 2)

```typescript
// 基于 celld 的 Session Manager
class SessionManager {
  constructor(private storage: SecStorage) {}
  
  async createSession(name: string, model: string): Promise<Session> {
    return Effect.runPromise(
      Effect.gen(function* () {
        const session: Session = {
          id: randomUUID(),
          name,
          model,
          status: 'active',
          createdAt: Date.now(),
        };
        
        // Create session in SQLite
        yield* this.storage.execute(
          'INSERT INTO sessions (id, name, model, status, created_at) VALUES (?, ?, ?, ?, ?)',
          [session.id, session.name, session.model, session.status, session.createdAt]
        );
        
        // Initialize three stores
        yield* this.initStores(session.id);
        
        return session;
      })
    );
  }
  
  private async initStores(sessionId: string): Promise<void> {
    // entries table
    yield* this.storage.execute(
      'CREATE TABLE IF NOT EXISTS entries (id, session_id, parent_id, type, content, created_at)'
    );
    // values table
    yield* this.storage.execute(
      'CREATE TABLE IF NOT EXISTS values (session_id, key, value, updated_at)'
    );
    // usage table
    yield* this.storage.execute(
      'CREATE TABLE IF NOT EXISTS usage (session_id, timestamp, tokens, cost)'
    );
  }
}
```

#### Layer 4: Agent Graph (依赖 Layer 3)

```typescript
// Agent Graph using Session Manager
class AgentGraph {
  constructor(
    private sessionManager: SessionManager,
    private runtime: RuntimeKernel,
  ) {}
  
  async scheduleTask(task: Task): Promise<Result> {
    // 1. Create sub-session for task
    const subSession = await this.sessionManager.createSession(
      task.name,
      task.model
    );
    
    // 2. Fork parent context (Copy-on-Write)
    await this.forkContext(task.parentSessionId, subSession.id, task.spec);
    
    // 3. Execute in runtime
    const result = await this.runtime.runTurn(subSession.id);
    
    // 4. Aggregate result
    return this.aggregateResult(result);
  }
}
```

#### Layer 5: Protocol + UI (依赖 Layer 4)

```typescript
// ACP Protocol using Effect
const acpTool = Tool.make(
  {
    name: "acp_invoke",
    description: "Invoke ACP service",
    parameters: Effect.Schema.Struct({
      service: Effect.Schema.String,
      method: Effect.Schema.String,
      args: Effect.Schema.Record(Effect.Schema.String, Effect.Schema.Unknown),
    }),
  },
  (args) =>
    Effect.gen(function* () {
      const response = yield* Effect.flatMap(
        AcpClient,
        (client) => client.invoke(args.service, args.method, args.args)
      );
      return response;
    })
);

// sec CLI using ACP
async function secRun(prompt: string): Promise<void> {
  const session = await sessionManager.createSession('sec', 'openrouter/free');
  await runtime.runTurn(session.id);
}
```

---

## 5. 框架对比

### 核心差异

| 框架 | 基础 | Storage | Agent | 评价 |
|------|------|---------|-------|------|
| **celld** | - | D1/KV/Queue | 无 | 只做存储 |
| **Effect** | Effect | 无 | Provider | 只做 Effect |
| **PI** | Node.js | SQLite | pi-agent-core | 完整但轻量 |
| **MAKA** | Node.js | SQLite | @maka/runtime | Runtime Event Log |
| **Omnigent** | Python | SQLAlchemy | Meta-harness | 多 harness 编排 |
| **sec v3** | Effect + celld | SQLite (via D1) | Effect Agent | 自研 |

### sec v3 的独特价值

```
sec v3 = Effect (类型安全) + celld (CF DO) + 自研 Runtime
```

不是重复造轮子，而是：
1. **Effect** 提供类型安全的 tool 定义和执行
2. **celld** 提供分布式存储和 CF DO 支持
3. **自研 Runtime** 基于 Effect + celld

---

## 6. 实现路径

### Phase 1: Effect + celld 基础 (最重要)

```typescript
// 1. celld Storage 实现
class SecStorage {
  // SQLite via D1 compatible API
  async query(sql: string, params: any[]): Promise<any[]>;
  async execute(sql: string, params: any[]): Promise<void>;
  
  // KV operations
  async kvGet(key: string): Promise<any>;
  async kvSet(key: string, value: any): Promise<void>;
  
  // Queue operations
  async enqueue(queue: string, task: Task): Promise<void>;
  async dequeue(queue: string): Promise<Task | null>;
}

// 2. Effect Layer 实现
const storageLayer = Layer.effect(SecStorage, CelldStorage);

// 3. Tool.make() 基于 storage
const sessionTools = [
  createSessionTool,
  getSessionTool,
  appendEntryTool,
  setValueTool,
  recordUsageTool,
];
```

### Phase 2: Runtime Kernel

```typescript
// Runtime Kernel 基于 Effect + celld
class RuntimeKernel {
  constructor(
    private storage: SecStorage,
    private modelProvider: ModelProvider,
    private tools: Tool[],
  ) {}
  
  async runTurn(sessionId: string): Promise<TurnResult>;
}
```

### Phase 3: Session Manager

```typescript
// Session Manager 管理 session 生命周期
class SessionManager {
  constructor(private storage: SecStorage) {}
  
  async createSession(name: string, model: string): Promise<Session>;
  async getSession(id: string): Promise<Session | null>;
  async deleteSession(id: string): Promise<void>;
  
  // 三个 store
  async appendEntry(sessionId: string, entry: Entry): Promise<void>;
  async setValue(sessionId: string, key: string, value: any): Promise<void>;
  async recordUsage(sessionId: string, usage: Usage): Promise<void>;
}
```

### Phase 4: Agent Graph

```typescript
// Agent Graph 调度 subagent
class AgentGraph {
  async scheduleTask(task: Task): Promise<Result>;
  async forkContext(parentId: string, childId: string, spec: TaskSpec): Promise<void>;
}
```

### Phase 5: Protocol + UI

```typescript
// ACP Protocol
const acpTools = [...];

// sec CLI
const secTools = [...sessionTools, ...acpTools];

// Tool.make() for all
```

---

## 7. 总结

### 核心架构

```
Effect Layer (类型安全)
       │
       ▼
celld Storage (SQLite via D1)
       │
       ├── Sessions
       ├── Entries (conversation tree)
       ├── Values (mutable state)
       ├── Usage (append-only)
       └── Events (runtime events)
       │
       ▼
Runtime Kernel (基于 Effect)
       │
       ▼
Session Manager (基于 celld)
       │
       ▼
Agent Graph (CoW subagent)
       │
       ▼
Protocol + UI
```

### 关键决策

1. **celld 是必须的** - CF DO 支持
2. **Effect + SQLite 是最重要的基础** - 类型安全 + ACID
3. **其他组件围绕这两个构建** - Layered architecture

### 不需要的东西

- ❌ rivet/agentos (可以用，但非必须)
- ❌ V8 Isolates (可以用，但非必须)
- ❌ 多 harness 编排 (Omnigent 做的，但 sec 不需要)
