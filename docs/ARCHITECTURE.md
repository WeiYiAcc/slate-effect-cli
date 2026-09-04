# Agent 组件原语对比文档

## 核心观点

> **celld + agentos = 平台层，sec 作为一个 agent 集成，pi = 本地化的完整 cell**

| 组件 | 角色 | 等价关系 |
|------|------|---------|
| **celld** | 分布式存储 | D1/KV/Queue |
| **agentos** | Agent 运行时 | V8 Isolates + ACP |
| **celld + agentos** | **平台层整体** | 不可分割 |
| **pi** | 本地化的完整 cell | = celld + agentos + 多个内置 agents |
| **multica** | 云端的完整 cell | = celld + agentos + Pi/Claude/Codex/Hermes |
| **sec** | **作为一个 agent** | 集成到 pi 或 multica 生态 |

---

## 1. 平台层：celld + agentos

celld 和 agentos 是一个整体，组成"平台层"：

```
┌─────────────────────────────────────────────────┐
│                  平台层 (Platform)                 │
├─────────────────────────────────────────────────┤
│                                                  │
│   celld ─────────────────────────────────────── │
│   │                                               │
│   │  KV Namespace     D1 Database   Queue        │
│   │  │                 │               │          │
│   │  └─────────────────┴───────────────┘          │
│   │                    │                         │
│   └────────────────────┼─────────────────────── │
│                        │                        │
│   agentos ────────────────────────────────────│
│   │                                               │
│   │  VM Runtime    ACP Protocol    Agent SDK    │
│   │     │              │              │          │
│   └─────┴──────────────┴──────────────┘          │
│                                                  │
└─────────────────────────────────────────────────┘
```

### celld 原语
| 原语 | 说明 |
|------|------|
| `KV` | 键值存储，namespace 隔离 |
| `D1` | SQLite 数据库 |
| `Queue` | 消息队列，支持 dead-letter |
| `Bucket` | S3/GS/AZ 对象存储 |
| `Peer` | P2P 节点发现和自愈 |

### agentos 原语
| 原语 | 说明 |
|------|------|
| `vm.agentOS()` | 创建 VM 实例 |
| `vm.getOrCreate()` | 获取或创建 agent |
| `handle.openSession()` | 打开持久 session |
| `handle.prompt()` | 发送 prompt |
| `conn.on('event')` | 事件订阅 |
| `ACP Protocol` | Agent Client Protocol |

---

## 2. pi = 本地化的完整 cell

**pi** 是一个本地化的"完整 cell"，等价于 celld + agentos + 多个内置 agents：

```
pi = celld (本地化) + agentos (本地化) + 多个内置 agents
       │                  │                   │
       ▼                  ▼                   ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────────┐
│ SQLite 文件  │   │ Node.js     │   │ Pi / Claude /   │
│ (替代 D1/KV)│   │ (替代 V8)   │   │ Codex agents    │
└─────────────┘   └─────────────┘   └─────────────────┘
```

### pi packages
| Package | 角色 | celld/agentos 对应 |
|--------|------|------------------|
| `pi-agent-core` | Agent 运行时 | agentos VM |
| `pi-session-backend-sqlite` | 持久化 | celld D1 |
| `pi-ai` | AI Provider | 内置 |
| `pi-chord` | 传输层 | agentos ACP |

### pi vs celld+agentos

| 维度 | celld + agentos (云端) | pi (本地) |
|------|------------------------|----------|
| **存储** | D1/KV/Queue (分布式) | SQLite 文件 |
| **运行时** | V8 Isolates | Node.js |
| **部署** | Cloudflare Workers | 本地进程 |
| **多租户** | 是 | 否 |
| **协议** | ACP/HTTP | 内部 |

---

## 3. multica = 云端的完整 cell

**multica** 是云端的 celld + agentos + 多个 agents 统一平台：

```
multica = celld + agentos + Pi/Claude/Codex/Hermes/...
                │            │
                ▼            ▼
        ┌───────────┐  ┌─────────────────┐
        │ 存储层    │  │ Agent 运行时    │
        │ D1/KV    │  │ V8 Isolates    │
        └───────────┘  └────────┬────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     多个 Agents      │
                    │ Pi / Claude / Codex │
                    │ Hermes / OMP / ...  │
                    └─────────────────────┘
```

### multica 原语
| 原语 | 说明 | celld/agentos 对应 |
|------|------|------------------|
| `multica agent` | Agent 管理 | agentos getOrCreate |
| `multica issue` | Issue 追踪 | celld D1 |
| `multica squad` | 多 agent 协作 | agentos multi-agent |
| `multica runtime` | Runtime 实例 | agentos VM |
| `multica skill` | Skill 管理 | agentos hooks |
| `multica autopilot` | 定时任务 | celld Queue |

---

## 4. sec = 作为一个 agent

**关键观点**：sec 不应该是一个独立的 CLI，而应该是一个集成到 pi 或 multica 生态的 **agent**：

### 错误的设计（当前）
```
sec (独立 CLI) ──调用──▶ multica
         │
         ├── Effect Agent Runtime
         └── 自己的存储
```

### 正确的设计
```
sec = multica 生态中的一个 agent

multica 生态
├── agents/
│   ├── pi-agent
│   ├── claude-agent
│   ├── codex-agent
│   └── sec-agent ◀── sec 作为这里的一个 agent
├── issues/
├── squads/
└── ...
```

### sec 作为 agent 的架构
```
┌─────────────────────────────────────────────────┐
│              pi / multica 生态                    │
│  ┌─────────────────────────────────────────┐   │
│  │  Platform Layer (celld + agentos)        │   │
│  │  ├── Storage (D1/KV/Queue)             │   │
│  │  └── VM Runtime (V8 Isolates)            │   │
│  └─────────────────────────────────────────┘   │
│                     │                           │
│  ┌─────────────────┼─────────────────────┐   │
│  │         多个 Agents                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────┐ │   │
│  │  │ Pi Agent │ │Claude.. │ │Sec.. │ │   │
│  │  │          │ │          │ │Agent │ │   │
│  │  └──────────┘ └──────────┘ └───┬───┘ │   │
│  │                               │      │   │
│  │                               ▼      │   │
│  │                    ┌──────────────┐  │   │
│  │                    │Effect Agent │  │   │
│  │                    │Runtime     │  │   │
│  │                    └──────────────┘  │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### sec-agent 的定位

| 属性 | 说明 |
|------|------|
| **类型** | Agent（不是独立 CLI） |
| **Provider** | @effect/ai-openrouter |
| **存储** | 复用 celld D1 或 pi SQLite |
| **通信** | 通过 ACP 或内部 API |
| **配置** | 集成到 pi/multica 配置 |

---

## 5. sec CLI 的正确设计

### 作为 pi/multica 的 agent

sec 应该作为 pi 或 multica 生态中的一个 agent 运行：

```bash
# pi 或 multica 内部
multica agent create sec-agent --runtime pi --provider openrouter

# sec CLI 变成 agent 调用
sec agent invoke sec-agent "Hello"

# 或者通过 pi
pi agent sec "Hello"
```

### 当前 sec 的问题

| 问题 | 说明 |
|------|------|
| 独立存储 | 有自己的 session JSON，不复用 celld/pi |
| 独立运行时 | 有自己的 Effect Agent，不在 pi 生态 |
| 弱集成 | 只是通过 CLI 调用 multica |

### 正确的 sec 设计

```typescript
// sec 作为 pi/multica 的 agent
const secAgent = new Agent({
  name: "sec",
  provider: "openrouter",  // @effect/ai-openrouter
  storage: "pi-session",   // 复用 pi 的存储
  protocol: "acp",          // 通过 ACP 通信
});
```

---

## 6. 各组件关系图

```
                    ┌─────────────────────────────────────────────────┐
                    │              celld + agentos (平台层)           │
                    │                                                 │
                    │   celld ─────────────────────────────────── │
                    │   │  KV / D1 / Queue / Bucket / Peer           │
                    │   └──────────────────────────────────────── │
                    │                                                 │
                    │   agentos ──────────────────────────────────│
                    │   │  V8 Isolates / ACP / Agent SDK          │
                    │   └──────────────────────────────────────── │
                    └──────────────────────────────────┬────────────┘
                                                       │
           ┌────────────────────────────────────────────┼────────────────────────────────────────────┐
           │                                            │                                            │
           ▼                                            ▼                                            ▼
┌─────────────────────┐                    ┌─────────────────────┐                    ┌─────────────────────┐
│        pi           │                    │      multica        │                    │      sec          │
│   (本地完整 cell)   │                    │    (云端完整 cell)    │                    │   (作为一个 agent) │
│                     │                    │                      │                    │                     │
│ celld (本地)        │                    │ celld (云端)          │                    │ agentos Runtime   │
│ agentos (本地)      │                    │ agentos (云端)        │                    │ + Effect Agent    │
│ + 内置 agents      │                    │ + Pi/Claude/Codex    │                    │                     │
│                     │                    │                      │                    │ 作为 agent 集成到    │
│ 本地进程部署         │                    │ Cloudflare 部署        │                    │ pi 或 multica 生态  │
└─────────────────────┘                    └─────────────────────┘                    └─────────────────────┘
           │                                            │                                            │
           │                                            │                                            │
           └────────────────────────────────────────────┴────────────────────────────────────────────┘
                                              │
                                              ▼
                                   ┌─────────────────────┐
                                   │   sec CLI 正确设计  │
                                   │                     │
                                   │ sec = agent, 不是   │
                                   │ 独立 CLI 工具       │
                                   │                     │
                                   │ 集成到 pi/multica   │
                                   │ 复用平台存储和运行时│
                                   └─────────────────────┘
```

---

## 7. 设计决策对比

| 维度 | pi (本地 cell) | multica (云端 cell) | sec (agent) |
|------|----------------|---------------------|-------------|
| **平台层** | 本地 celld+agentos | 云端 celld+agentos | 复用 |
| **存储** | SQLite 文件 | D1/KV | 复用平台存储 |
| **运行时** | Node.js | V8 Isolates | 复用 + Effect Agent |
| **Agent** | 内置 Pi | Pi/Claude/Codex/Hermes | 作为一个 agent |
| **协议** | 内部 | ACP/HTTP | ACP 或内部 |
| **部署** | 本地进程 | Cloudflare Workers | 集成部署 |

---

## 8. 结论：sec 正确设计

### 正确观点
- **sec = 作为一个 agent**，集成到 pi 或 multica 生态
- **pi = 本地化的 celld + agentos + 多个 agents**
- **multica = 云端的 celld + agentos + 多个 agents**

### sec v2 架构
1. **作为 pi agent**：sec = Effect Agent Runtime + @effect/ai-openrouter，集成到 pi 的 session 存储
2. **作为 multica agent**：sec = 同上，通过 ACP 与 multica 通信
3. **保持 CLI 包装**：提供 `sec` CLI 命令，但背后调用 pi/multica agent API

### 下一步
1. 将 sec 重构为 pi/multica 的 agent provider
2. 复用 pi 的 session 存储（SQLite）
3. 通过 pi 的 API 或 ACP 协议调用
4. 保持 CLI 包装作为用户体验层


---

## 9. Jido/Elixir/OTP 关联分析

### Jido 是什么
Elixir/OTP 之上的 autonomous agent framework，形式化 GenServer 之上的 agent pattern。

### Jido Assembly 架构
- **People + Agents 同等地位** - 共享 rooms/messages/threads
- **Signal 路由一切** - CloudEvents 兼容
- **On-demand Agent 执行** - 每次启动 short-lived runtime
- **Hologram UI** - Elixir 编译到 JS

### TS 框架对应实现

| Jido/Elixir | TypeScript 等价 |
|------------|----------------|
| Jido.Agent | agentos + Effect Agent |
| Jido Signal | agentos ACP + pi-chord |
| Jido Messaging | celld D1/SQLite |
| Jido Action | Effect Agent Tool.make() |
| Jido AI | @rivet-dev/agentos (Pi/Claude) |
| Hologram | React + SSE |
| BEAM | V8 Isolates |
| OTP Supervision | 自己实现 |
| Phoenix PubSub | celld Queue + SSE |

### 实现难度
- ✅ **完全可实现**: Agent runtime、Storage、Tools、Signals
- ⚠️ **部分可实现**: UI（React 替代 Hologram）、Supervision
- ❌ **难以等价**: BEAM 进程模型、LiveView

### sec v3 演进方向
1. 复用 celld + agentos 作为平台层
2. 用 Effect Agent Tool.make() 提供 actions
3. 集成 multica 作为 provider 适配器
4. 添加 React UI（替代 Hologram）

详见: [`JIDO-OTP-ANALYSIS.md`](./JIDO-OTP-ANALYSIS.md)


---

## 10. maka (Apache) - Runtime Event Log 架构

### 什么是 maka

**Apache Maka** = 高性能 agent workspace，用 append-only Runtime Event Log 管理 agent 状态

- 官方网站: https://maka.apache.org/
- 仓库: https://github.com/apache/maka
- 技术栈: Node.js 22+ / Rust / SQLite / Electron

### maka 核心设计

**Log Is the Runtime** - 核心哲学

```
State(t) = Project(RuntimeEvents[0..t], policy, runtime configuration)
```

Runtime Event Log 是所有状态的语义来源，Session/Run/UI/Recovery 都是 Log 的投影。

### maka packages

| Package | 角色 |
|---------|------|
| `packages/core` | Session, RuntimeEvent, AgentRun, permission 合约 |
| `packages/storage` | SQLite 存储控制平面 |
| `packages/runtime` | SessionManager, AgentRun, model adapters, tools |
| `packages/runtime-host` | 唯一执行权威 + 公共协议 |
| `packages/eval` | 实验细胞, attempts, result selection |
| `packages/cli` | TUI, `maka run`, `maka eval` |

### maka 的 Actor/OTP 等价

| Elixir/OTP | maka 等价 |
|------------|----------|
| GenServer | Runtime Kernel |
| OTP Supervision | Runtime Host (单一权威) |
| Phoenix Presence | Runtime Event Log projection |
| Phoenix PubSub | SSE + WebSocket |
| Agent Registry | SessionManager |
| ETS | SQLite |

### maka 的多 Agent 调度

**Copy-on-Write vs Mailboxes** 两种路径

maka 选择 **Copy-on-Write (Workflow Graph)**:
- subagent 不自动继承父 agent 完整对话
- 显式的 task specification
- 单向数据流

```text
Main Agent ── task ──> Subagent
Main Agent <── result ── Subagent
```

Codex 选择 **Mailboxes (Message-Driven)**:
- 每个 agent 有地址和私有 mailbox
- 异步消息传递
- 多轮对话

---

## 11. rivet/agentos 的 Actor 实现

### rivet crates

| Crate | 角色 |
|-------|------|
| `actor-uds-client` | Unix Domain Socket actor 客户端 |
| `kernel` | 核心 kernel |
| `runtime` | Runtime 管理 |
| `v8-runtime` | V8 isolate runtime |
| `execution` | 执行引擎 |
| `agentos-protocol` | ACP 协议 |
| `agentos-sidecar` | Sidecar 实现 |

### rivet/agentos vs BEAM/OTP

| BEAM/OTP | rivet/agentos |
|----------|--------------|
| BEAM 进程 | V8 Isolates |
| OTP Supervision | 无原生等价（需自己实现）|
| GenServer | Agent Runtime |
| Registry | SessionManager |
| Phoenix PubSub | ACP Protocol |
| ETS | D1/SQLite |

### rivet 的限制

1. **V8 Isolates 比 BEAM 重** - 内存开销更大
2. **无原生 Supervision** - 需要自己实现故障恢复
3. **单进程模型** - 扩展性不如分布式 BEAM

---

## 12. BEAM/OTP 的 TS/JS 替代方案

### 方案对比

| 方案 | 进程模型 | Supervision | 消息传递 | 状态管理 |
|------|---------|-------------|---------|---------|
| **BEAM/OTP** | 百万级轻量进程 | 原生监督树 | Mailbox | ETS/持久化 |
| **rivet/agentos** | V8 Isolates | 无 | ACP Protocol | D1/SQLite |
| **maka** | Node.js workers | Runtime Host | SSE/WebSocket | SQLite + Event Log |
| **pi** | Node.js | 无 | chord | SQLite |
| **Effect Agent** | Effect Runtime | 无 | Effect Layer | Provider |

### 各方案评价

#### rivet/agentos
- ✅ V8 Isolates 隔离性好
- ✅ ACP Protocol 标准化
- ✅ 支持 Pi/Claude/Codex agents
- ❌ 无 OTP Supervision
- ❌ V8 比 BEAM 重

#### maka
- ✅ Runtime Event Log 设计优秀
- ✅ SQLite 持久化
- ✅ Agent Graph 调度
- ❌ 无原生 actor 模型
- ❌ 依赖 Electron

#### pi (earendil-works)
- ✅ chord (facet-service) 设计好
- ✅ 轻量 Node.js
- ❌ 无 Supervision
- ❌ 功能较少

---

## 13. sec v3 架构：整合所有框架

### 目标架构

```
sec v3 = celld + agentos + maka 设计 + pi + Effect Agent

┌─────────────────────────────────────────────────────────────┐
│                    Runtime Host (maka 风格)                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Runtime Event Log (append-only)             │ │
│  │   Session / Run / Tool / Permission / Termination      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                            │                                 │
│  ┌─────────────────────────┼─────────────────────────────┐ │
│  │              SessionManager                             │ │
│  │   - Session lifecycle                                   │ │
│  │   - Turn orchestration                                 │ │
│  │   - Agent spawn/terminate                              │ │
│  └─────────────────────────┬─────────────────────────────┘ │
│                            │                                 │
│  ┌─────────────────────────┼─────────────────────────────┐ │
│  │              Agent Graph (maka Copy-on-Write)          │ │
│  │   - Task decomposition                                 │ │
│  │   - Subagent spawning                                  │ │
│  │   - Result aggregation                                 │ │
│  └─────────────────────────┬─────────────────────────────┘ │
│                            │                                 │
│  ┌─────────────────────────┼─────────────────────────────┐ │
│  │              Runtime Kernel (Effect Agent)              │ │
│  │   - Model loop                                         │ │
│  │   - Tool execution                                     │ │
│  │   - Context management                                 │ │
│  │   - Recovery                                            │ │
│  └─────────────────────────┬─────────────────────────────┘ │
│                            │                                 │
│  ┌─────────────────────────┼─────────────────────────────┐ │
│  │              Tool Registry (Tool.make())               │ │
│  │   - Filesystem (WorkspaceExecutor)                      │ │
│  │   - Shell (Bash)                                       │ │
│  │   - Search (Grep)                                      │ │
│  │   - Custom tools                                       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Storage (celld + SQLite)                    │ │
│  │   - Sessions (SQLite)                                  │ │
│  │   - KV (D1/celld)                                     │ │
│  │   - Queue (celld)                                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 关键设计决策

#### 1. 采用 maka 的 Runtime Event Log
- append-only log 作为状态来源
- Session/Run/UI 都是 log 的投影
- 支持 crash recovery 和 continuation

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

### 实现步骤

```
Phase 1: Runtime Event Log (maka)
  - Event schema definition
  - Log storage (SQLite)
  - Projection system

Phase 2: SessionManager (maka + rivet)
  - Session/Run/Turn lifecycle
  - Agent spawn/terminate
  - Permission system

Phase 3: Runtime Kernel (Effect Agent)
  - Model loop
  - Tool execution
  - Context management

Phase 4: Agent Graph (maka Copy-on-Write)
  - Task decomposition
  - Subagent spawning
  - Result aggregation

Phase 5: ACP Protocol (rivet)
  - Agent间通信
  - Provider bridges

Phase 6: UI (集成现有产品)
  - SSE/WebSocket
  - Real-time updates
```

---

## 14. 框架对比总结

| 框架 | 语言 | 进程模型 | Supervision | 消息 | 存储 | 特点 |
|------|------|---------|-------------|------|------|------|
| **BEAM/OTP** | Elixir | 百万级轻量进程 | 原生监督树 | Mailbox | ETS | 黄金标准 |
| **Jido** | Elixir | GenServer | OTP Supervision | Signal | D1/KV | Agent framework |
| **maka** | Node.js/Rust | Node workers | Runtime Host | SSE | SQLite | Runtime Event Log |
| **rivet/agentos** | TypeScript/Rust | V8 Isolates | 无 | ACP | D1/SQLite | V8 隔离 |
| **pi** | TypeScript | Node.js | 无 | chord | SQLite | Facet-service |
| **sec v3** | TypeScript | V8 + Node | Runtime Host | ACP + SSE | SQLite | 整合所有 |

### sec v3 的独特价值

```
sec v3 = maka 的 Runtime Event Log + rivet 的 V8 Runtime + pi 的 chord + Effect Agent 的 Tool.make() + celld 的存储
```

这不是重复造轮子，而是：
1. **maka** 没有 V8 runtime，只有 Node.js
2. **rivet** 没有 Runtime Event Log 设计
3. **pi** 功能较少，不是完整 workspace
4. **celld** 只是存储，不是 runtime

sec v3 整合这些框架的最佳特性，提供一个完整的本地 agent workspace。
