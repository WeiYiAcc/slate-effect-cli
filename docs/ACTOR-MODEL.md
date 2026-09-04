# sec v3: Actor 模型实现设计（不用 rivet/agentos）

## 1. 核心问题

**不用 rivet/agentos，怎么实现 Actor 模型？**

**答案**: 基于 Effect + celld (SQLite) + 自研 Actor Runtime

---

## 2. Actor 模型核心要素

| 要素 | 实现方式 |
|------|---------|
| **隔离** | 每个 Actor 是独立对象 + SQLite 持久化 |
| **消息传递** | Mailbox (Queue) + Effect |
| **状态管理** | Ref<State> + 乐观锁版本号 |
| **监督恢复** | ActorSupervisor + 重启策略 |
| **位置透明** | ActorRegistry (名字服务) |
| **生命周期** | start/stop/restart + SQLite 恢复 |

---

## 3. 架构

```
┌─────────────────────────────────────────────────────────────┐
│                 Actor Runtime (自研)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Actor Class                                                │
│  ├── state: Ref<ActorState> (内存)                         │
│  ├── mailbox: Queue<Message>                                │
│  ├── handle(msg): Effect<A, E, R>                         │
│  └── persist(): SQLite                                     │
│                                                              │
│  ActorSupervisor                                           │
│  ├── children: Map<ActorId, Actor>                        │
│  ├── restart strategy: one_for_one                         │
│  └── backoff: exponential                                  │
│                                                              │
│  ActorRegistry                                             │
│  ├── byName: Map<Name, ActorId>                          │
│  └── byGroup: Map<Group, ActorId[]>                       │
│                                                              │
│  MailboxTransport                                          │
│  ├── Local: Direct call                                    │
│  └── Queue: SQLite-backed                                  │
│                                                              │
│  Storage (celld)                                           │
│  ├── actor_state: 状态快照                                  │
│  └── actor_mailbox: 消息队列                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Actor 基类实现

```typescript
import { Effect, Ref, Queue, Layer, Schema } from "effect";
import { SecStorage } from "./storage";

// Actor 基类
abstract class Actor<S> {
  readonly id: string;
  protected state: Ref.Ref<S>;
  protected mailbox: Queue.Queue<Message>;
  
  constructor(
    id: string,
    initialState: S,
    private storage: SecStorage,
  ) {
    this.id = id;
    this.state = Ref.unsafeMake(initialState);
    this.mailbox = Queue.unbounded<Message>();
  }
  
  // 处理消息 - 子类实现
  protected abstract handle(msg: Message): Effect.Effect<unknown, never, never>;
  
  // 发送消息 (cast)
  cast(msg: Message): Effect.Effect<void> {
    return Queue.offer(this.mailbox, msg);
  }
  
  // 调用并等待响应 (call)
  call<T>(msg: Message): Effect.Effect<T> {
    return Effect.gen(this, function* () {
      const replyTo = Yielded.make<T>();
      const fullMsg = { ...msg, replyTo };
      yield* Queue.offer(this.mailbox, fullMsg);
      return yield* Yielded.await(replyTo);
    }.bind(this));
  }
  
  // 启动
  start(): Effect.Effect<void, never, never> {
    return Effect.gen(this, function* () {
      // 从 SQLite 恢复状态
      const persisted = yield* this.storage.getActorState(this.id);
      if (persisted) {
        yield* Ref.set(this.state, persisted);
      }
      // 启动消息循环
      yield* this.runLoop();
    });
  }
  
  // 消息循环
  private runLoop(): Effect.Effect<void, never, never> {
    return Effect.gen(this, function* () {
      while (true) {
        const msg = yield* Queue.take(this.mailbox);
        yield* Effect.tryPromise(() => this.handle(msg));
        yield* this.persist();
      }
    }.bind(this));
  }
  
  // 持久化
  private persist(): Effect.Effect<void, never, never> {
    return Effect.gen(this, function* () {
      const s = yield* Ref.get(this.state);
      yield* this.storage.setActorState(this.id, s);
    });
  }
}
```

---

## 5. 具体 Actor: Session Actor

```typescript
// Session Actor - 管理会话
interface SessionData {
  id: string;
  name: string;
  entries: Entry[];      // write-once
  values: Map<string, any>;  // mutable
  usage: Usage[];        // append-only
  branch: string;        // 当前分支
  operationState: string; // 操作状态
}

class SessionActor extends Actor<SessionData> {
  protected handle(msg: Message): Effect.Effect<unknown, never, never> {
    return Effect.gen(this, function* () {
      switch (msg.type) {
        case "append_entry":
          return yield* this.appendEntry(msg.entry);
        case "get_entries":
          return yield* this.getEntries();
        case "set_value":
          return yield* this.setValue(msg.key, msg.value);
        case "get_value":
          return yield* this.getValue(msg.key);
        case "record_usage":
          return yield* this.recordUsage(msg.usage);
        case "fork":
          return yield* this.fork(msg.branchName);
        case "switch_branch":
          return yield* this.switchBranch(msg.branch);
      }
    }.bind(this));
  }
  
  private appendEntry(entry: Entry): Effect.Effect<void> {
    return Ref.update(this.state, (s) => ({
      ...s,
      entries: [...s.entries, entry],
    }));
  }
  
  private getEntries(): Effect.Effect<Entry[]> {
    return Ref.get(this.state).pipe(Effect.map((s) => s.entries));
  }
  
  private setValue(key: string, value: any): Effect.Effect<void> {
    return Ref.update(this.state, (s) => ({
      ...s,
      values: new Map(s.values).set(key, value),
    }));
  }
  
  private recordUsage(usage: Usage): Effect.Effect<void> {
    return Ref.update(this.state, (s) => ({
      ...s,
      usage: [...s.usage, usage],
    }));
  }
  
  private fork(branchName: string): Effect.Effect<string> {
    return Effect.gen(this, function* () {
      const state = yield* Ref.get(this.state);
      const forkId = crypto.randomUUID();
      const forkState: SessionData = {
        ...state,
        id: forkId,
        name: state.name + ":" + branchName,
        branch: branchName,
        entries: state.entries,
        values: new Map(state.values),
        usage: [],
      };
      yield* this.storage.setActorState(forkId, forkState);
      return forkId;
    });
  }
}
```

---

## 6. Supervisor

```typescript
// 监督策略
type RestartStrategy = "one_for_one" | "one_for_all" | "rest_for_one";

interface SupervisorOptions {
  strategy: RestartStrategy;
  maxRestarts: number;
  backoff: { min: number; max: number };
}

class ActorSupervisor {
  private children = new Map<string, Actor<any>>();
  private restarts = new Map<string, number>();
  
  constructor(private options: SupervisorOptions) {}
  
  // 启动子 actor
  startChild<A extends Actor<any>>(actor: A): Effect.Effect<void> {
    return Effect.gen(this, function* () {
      this.children.set(actor.id, actor);
      yield* actor.start();
    });
  }
  
  // 处理失败
  handleFailure(actorId: string, error: unknown): Effect.Effect<void> {
    return Effect.gen(this, function* () {
      const count = this.restarts.get(actorId) ?? 0;
      
      if (count >= this.options.maxRestarts) {
        yield* Effect.logError(`Actor ${actorId} exceeded max restarts`);
        return;
      }
      
      const delay = Math.min(
        this.options.backoff.min * Math.pow(2, count),
        this.options.backoff.max,
      );
      yield* Effect.sleep(delay);
      
      const actor = this.children.get(actorId);
      if (actor) {
        yield* actor.start();
        this.restarts.set(actorId, count + 1);
      }
    });
  }
  
  // 停止所有
  stopAll(): Effect.Effect<void> {
    return Effect.gen(this, function* () {
      for (const actor of this.children.values()) {
        yield* actor.cast({ type: "stop" });
      }
      this.children.clear();
    });
  }
}
```

---

## 7. Registry

```typescript
// Actor 注册表
class ActorRegistry {
  private byName = new Map<string, string>();
  private byGroup = new Map<string, Set<string>>();
  
  // 注册
  register(name: string, actorId: string, group?: string): void {
    this.byName.set(name, actorId);
    if (group) {
      if (!this.byGroup.has(group)) {
        this.byGroup.set(group, new Set());
      }
      this.byGroup.get(group)!.add(actorId);
    }
  }
  
  // 查找
  whereis(name: string): string | undefined {
    return this.byName.get(name);
  }
  
  // 列出组
  listGroup(group: string): string[] {
    return Array.from(this.byGroup.get(group) ?? []);
  }
  
  // 注销
  unregister(name: string): void {
    const actorId = this.byName.get(name);
    if (actorId) {
      this.byName.delete(name);
      for (const set of this.byGroup.values()) {
        set.delete(actorId);
      }
    }
  }
}
```

---

## 8. SQLite Schema

```sql
-- Actor state
CREATE TABLE actor_state (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,  -- idle | busy | stopped
  data JSON NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Mailbox (持久化消息)
CREATE TABLE actor_mailbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  payload JSON NOT NULL,
  timestamp INTEGER NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_mailbox_actor ON actor_mailbox(actor_id, timestamp);

-- Supervision tree
CREATE TABLE supervision_tree (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  strategy TEXT NOT NULL,
  max_restarts INTEGER NOT NULL
);
```

---

## 9. 与 Effect Layer 集成

```typescript
// Effect Layer
const ActorLayer = Layer.effect(
  ActorRuntime,
  Effect.map(SecStorage, (storage) => new ActorRuntime(storage))
);

// Tool.make() using Actor
const createSessionTool = Tool.make(
  {
    name: "create_session",
    description: "Create a new session actor",
    parameters: Effect.Schema.Struct({
      name: Effect.Schema.String,
      model: Effect.Schema.String,
    }),
  },
  ({ name, model }) =>
    Effect.gen(function* () {
      const runtime = yield* ActorRuntime;
      const actor = new SessionActor(
        crypto.randomUUID(),
        { id: crypto.randomUUID(), name, model, entries: [], values: new Map(), usage: [], branch: "main", operationState: "idle" },
        yield* SecStorage,
      );
      yield* runtime.startChild(actor);
      runtime.register(name, actor.id, "sessions");
      return actor.id;
    })
);
```

---

## 10. 与 MAKA 的对比

| 维度 | MAKA | sec v3 Actor |
|------|------|--------------|
| **状态** | RuntimeEvent Log | Ref<State> + SQLite |
| **多客户端** | Runtime Host | ActorRegistry |
| **Subagent** | Agent Graph CoW | Fork SessionActor |
| **Supervision** | Runtime Host | ActorSupervisor |
| **Storage** | SQLite | celld/SQLite |

---

## 11. 总结

**不用 rivet/agentos，用 Effect + celld + 自研 Actor Runtime**:

1. **Actor** - Effect + Ref<State> + SQLite
2. **Supervisor** - 重启策略 + 指数退避
3. **Registry** - 名字到 ID 的映射
4. **Mailbox** - Effect Queue + SQLite 持久化

**这就是 sec v3 的 Actor 模型**。
