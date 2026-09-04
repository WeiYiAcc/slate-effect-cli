# celld vs rivet/actors: 完整对比

> 基于 rivet-dev/actors 仓库分析 (https://github.com/rivet-dev/actors)

---

## 1. 核心定位对比

| 组件 | 定位 | 关键词 |
|------|------|--------|
| **celld** | 分布式存储 | KV, D1, Queue, Bucket, Peer |
| **rivet/actors** | Actor Runtime | State, Persistence, Queues, Workflows |
| **CF Durable Objects** | 原始 Actor + 存储 | In-memory, Persistence, WebSocket, Queues |

### 关键发现

**celld ≠ rivet/actors**

它们是不同的东西：
- celld = 分布式存储基础设施
- rivet = Actor Runtime
- CF DO = 原始的 Actor + 存储

---

## 2. rivet/actors 详细分析

### rivet/actors 是什么

Rivet Actors = **Long-running, lightweight processes for stateful workloads**

```typescript
const agent = actor({
  // In-memory, persisted state
  state: { messages: [] as Message[] },

  // Long-running actor process
  run: async (c) => {
    for await (const msg of c.queue.iter()) {
      c.state.messages.push({ role: "user", content: msg.body.text });
      const response = streamText({ model: openai("gpt-5"), messages: c.state.messages });
      for await (const delta of response.textStream) {
        c.broadcast("token", delta);
      }
      c.state.messages.push({ role: "assistant", content: await response.text });
    }
  },
});
```

### rivet/actors 提供的功能

| 功能 | 说明 |
|------|------|
| **In-memory State** | 内存状态，自动持久化 |
| **SQLite per Actor** | 每个 actor 一个 SQLite 数据库 |
| **Queues** | 内置消息队列 |
| **Workflows** | 多步骤操作，自动重试 |
| **Scheduling** | 定时任务 |
| **WebSockets** | 实时双向通信 |
| **Per-Tenant DB** | 每个租户一个 actor |

### rivet/actors 的存储选项

1. **Built-in SQLite** (per actor)
2. **BYO Database** (Bring Your Own)

---

## 3. celld 详细分析

### celld 是什么

celld = **Self-hosted distributed Durable Objects**

```bash
celld --bucket s3://NAME          # AWS S3
celld --bucket gs://NAME         # Google Cloud Storage
celld --bucket az://NAME         # Azure Blob
celld --bucket                   # 本地文件系统
```

### celld 提供的功能

| 功能 | 说明 |
|------|------|
| **KV Namespace** | 键值存储 |
| **D1** | SQLite 数据库 |
| **Queue** | 消息队列，支持 dead-letter |
| **Bucket** | S3/GS/AZ 对象存储 |
| **Peer** | P2P 节点发现和自愈 |

---

## 4. 功能重叠分析

### 重叠矩阵

| 功能 | celld | rivet/actors | CF DO |
|------|-------|---------------|-------|
| **Actor Model** | ❌ | ✅ | ✅ |
| **SQLite** | ✅ (D1) | ✅ (per actor) | ❌ |
| **KV Storage** | ✅ | ❌ | ✅ |
| **Queue** | ✅ | ✅ | ✅ |
| **Object Storage** | ✅ | ❌ | ✅ (R2) |
| **WebSocket** | ❌ | ✅ | ✅ |
| **Workflows** | ❌ | ✅ | ❌ |
| **Distributed** | ✅ (Peer) | ❌ | ✅ |
| **Multi-backend** | ✅ | ❌ | ❌ |

### 关键区别

1. **celld 不是 Actor Runtime**
   - celld 只提供存储
   - 没有 actor 概念
   - 没有消息处理

2. **rivet 是 Actor Runtime**
   - 每个 actor 有状态
   - 内置消息队列
   - 内置工作流

3. **CF DO 是原始 Actor**
   - DO 本身就是一个 actor
   - 内置状态 + 队列 + WebSocket
   - 需要手动实现逻辑

---

## 5. 部署架构对比

### 方案 1: 直接用 CF DO

```
CF Durable Objects
├── Actor Model (内置)
├── In-memory State (内置)
├── Persistence (R2/D1)
├── WebSocket (内置)
└── Queue (内置)
```

**优点**: 最简单
**缺点**: 需要自己实现业务逻辑

### 方案 2: celld + CF DO

```
CF DO ──▶ celld Storage
         ├── KV (via DO)
         ├── D1 (via DO)
         └── Queue (via DO)
```

**优点**: 统一的存储抽象
**缺点**: celld 没有 actor 模型

### 方案 3: rivet + CF DO

```
CF DO ──▶ rivet Runtime
         ├── Actor Runtime
         ├── SQLite per Actor
         ├── Queues
         └── Workflows
```

**优点**: 完整的 actor 模型
**缺点**: 可能有功能重叠

### 方案 4: celld + rivet (非 CF)

```
celld Storage                    rivet Runtime
├── KV                          ├── Actors
├── D1                          ├── Queues
├── Queue                       └── Workflows
└── Bucket
```

**优点**: 两者都是必要的
**缺点**: 没有 CF DO

---

## 6. 关键问题: 冲突还是互补？

### 如果 rivet 可以部署在 CF DO 上

```
CF DO (Actor + Storage)
      │
      ├── rivet 使用 CF DO 的 actor
      │       └── rivet 的 actor = CF DO 实例
      │       └── rivet 的存储 = CF DO 内置
      │
      └── celld 呢？
              ├── celld 可以使用 CF DO 作为 backend
              └── celld 的 KV/D1/Queue = CF DO 的能力
```

**结论**: 它们可能相遇在 CF DO 层，但：
- rivet 使用 CF DO 的 actor 模型
- celld 使用 CF DO 的存储能力
- 它们不直接冲突

### 如果用其他后端 (非 CF)

| 场景 | celld | rivet | 冲突？ |
|------|-------|-------|--------|
| AWS | S3/DynamoDB | EC2/自有 DB | ❌ 不冲突 |
| GCP | GCS/Bigtable | GCE/自有 DB | ❌ 不冲突 |
| Azure | AZ Blob/D1 | VM/自有 DB | ❌ 不冲突 |
| 本地 | 文件系统 | SQLite | ❌ 不冲突 |

---

## 7. 实际架构选择

### 场景 1: 本地开发 + 云端部署

```
本地开发:
├── celld (文件存储)
├── rivet (actor runtime)
└── SQLite

云端部署 (CF DO):
├── CF DO (actor + 存储)
├── celld (可选，如果需要额外抽象)
└── rivet (可选，如果需要额外 actor 功能)
```

### 场景 2: 企业内部部署

```
celld (分布式存储)
      │
      ├── S3 Backend
      ├── D1 (SQLite)
      ├── Queue
      └── Bucket
      │
      ▼
rivet (Actor Runtime)
      │
      ├── Actors
      ├── SQLite per Actor
      ├── Queues
      └── Workflows
```

### 场景 3: 纯 CF DO

```
CF Durable Objects
      │
      ├── DO 实例 = Actor
      ├── 内置状态
      ├── 内置队列
      └── 内置 WebSocket
      │
      ▼
不需要 celld
不需要 rivet
```

---

## 8. 建议的 sec v3 架构

### 基于用户的约束

1. ✅ celld 是必须的 (CF DO 支持)
2. ❓ rivet/agentos 不一定用
3. ✅ Effect 是基础
4. ✅ SQLite 是基础

### 架构选择

**如果用 rivet/agentos**:

```
sec v3 = rivet/agentos + celld + Effect

├── rivet/agentos (Actor Runtime)
│   └── 每个 session = 一个 actor
│
├── celld (Storage)
│   ├── 跨 actor 的共享数据
│   ├── 配置存储
│   └── 审计日志
│
└── Effect (AI Provider)
    └── Tool.make()
```

**如果不用 rivet/agentos**:

```
sec v3 = celld + 自研 Actor + Effect

├── celld (Storage + Actor)
│   └── 每个 session = 一个 DO-like actor
│
└── Effect (AI Provider)
    └── Tool.make()
```

### 最终建议

**不冲突！** celld 和 rivet 是互补的：

- celld = 分布式存储基础设施
- rivet = Actor Runtime
- CF DO = 原始的 actor + 存储

**选择取决于**:
1. 部署目标 (CF DO vs 其他)
2. 功能需求 (是否需要 rivet 的额外功能)
3. 复杂度容忍度

---

## 9. 总结

| 问题 | 答案 |
|------|------|
| celld 和 rivet 冲突吗？ | **否**，它们是互补的 |
| rivet 可以部署在 CF DO 吗？ | **可以**，CF DO 本身就是 actor |
| 如果用 CF DO，还需要 celld 吗？ | **可选**，取决于是否需要额外抽象 |
| 如果用 rivet，还需要 celld 吗？ | **可能**，如果需要跨 actor 共享存储 |

### 最终架构

```
sec v3 架构选项:

选项 A: rivet + celld + Effect
  ├── rivet: Actor Runtime
  ├── celld: 共享存储
  └── Effect: AI Provider

选项 B: celld + 自研 Actor + Effect
  ├── celld: Actor + Storage (via DO-like)
  └── Effect: AI Provider

选项 C: 纯 CF DO + Effect
  ├── CF DO: Actor + Storage
  └── Effect: AI Provider
```
