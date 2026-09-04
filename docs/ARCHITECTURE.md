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
