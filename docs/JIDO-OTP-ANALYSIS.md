# Jido + OTP 架构分析报告

## 1. Jido 是什么

**Jido** = Elixir/OTP 之上的 autonomous agent framework
- 官方网站: https://jido.run
- 仓库: https://github.com/agentjido/jido
- 设计目标: 形式化 GenServer 之上的 agent pattern

### Jido 核心原语
| 原语 | 说明 |
|------|------|
| `Jido.Agent` | 不可变 agent 数据结构 + `cmd/2` |
| `Action` | 状态转换命令 |
| `Signal` | CloudEvents 兼容的事件信封 |
| `Directive` | 运行时执行的效果描述 |

### Jido 生态系统
| 包 | 角色 |
|----|------|
| `jido` | 核心 agent framework |
| `jido_ai` | AI/LLM 集成 |
| `jido_action` | 可组合 actions |
| `jido_signal` | CloudEvents 消息信封 |
| `req_llm` | LLM API HTTP 客户端 |
| `jido_chat` | 消息路由 |
| `jido_messaging` | 持久化消息 |

---

## 2. Jido Assembly: Slack Clone 架构分析

Jido Assembly 是一个**用 Jido 生态构建的 Slack clone**，证明可以在 BEAM 上构建完整的 agent-native 应用。

### 四个核心组件

```
┌─────────────────────────────────────────────────────────────┐
│                     Hologram (UI)                            │
│   Actions (browser) + Commands (server) + SSE broadcasts    │
└──────────────────────┬──────────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Jido        │  │ Jido        │  │ Jido        │
│ Messaging   │  │ Signal      │  │ Chat        │
│             │  │             │  │             │
│ - Rooms    │  │ - CloudEvts │  │ - Telegram  │
│ - Messages │  │ - Routing   │  │ - Discord   │
│ - Threads  │  │             │  │             │
│ - SQLite   │  │             │  │             │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │   Jido + Jido   │
              │       AI        │
              │                 │
              │ - Triage Agent  │
              │ - Bridge Agent  │
              │ - Runbook Agent │
              └─────────────────┘
```

### 关键设计

1. **People + Agents 同等地位**
   - 人类和 agent 都通过相同的 rooms/messages/threads/events
   - Agent 是 application participants，不是独立的 chatbot

2. **Signal = 一切的连接器**
   - 每个 commit 产生 Signal
   - Signal 路由到所有订阅者
   - Provider 适配器（Telegram/Discord）也是 Signal 路由

3. **On-demand Agent 执行**
   - 用户在 ops panel 输入 prompt
   - 选择 Ask 启动 round
   - 启动 short-lived runtime 执行 agent

4. **Hologram 替代 LiveView**
   - 客户端 state (browser)
   - Server Commands (持久化/agent)
   - SSE broadcasts (实时)

### 消息流（4 个阶段）

1. **人发消息** - Hologram action → server command → Jido Messaging 写入
2. **Agent 响应** - Jido AI 启动 short-lived runtime，agent 读取 context
3. **事件广播** - Signal 路由到所有订阅者（SSE）
4. **Provider 桥接** - 消息路由到 Telegram/Discord

---

## 3. 在 TypeScript / Effect Agent / agentos / rivet / celld 框架内能实现什么

### ✅ 完全可实现

| Jido 功能 | TS 对应实现 | 状态 |
|----------|------------|------|
| **Jido.Agent** | `@rivet-dev/agentos` VM runtime | ✅ 可用 |
| **Jido Signal** | `pi-chord` (facet-service) | ✅ 可用 |
| **Jido Messaging** | `celld` (D1/SQLite) + `pi-session-backend-sqlite` | ✅ 可用 |
| **Jido Action** | `effect-agent` 的 `Tool.make()` | ✅ 可用 |
| **Jido AI** | `@rivet-dev/agentos` (Pi/Claude/Codex) | ✅ 可用 |
| **Jido Chat** | agentos ACP protocol (provider-neutral) | ✅ 可用 |

### ⚠️ 部分可实现（需要适配）

| Jido 功能 | 现状 | 差距 |
|----------|------|------|
| **Hologram** (UI) | 只能 SSR/LiveView in Elixir | TS 替代需要 `liveview-js` 或 React 实时 |
| **BEAM 进程模型** | V8 Isolates / Node.js workers | 类似但不完全等价 |
| **OTP 监督树** | agentos 没有原生 supervision | 需要自己实现 |
| **Phoenix PubSub** | 需用 celld Queue + SSE | 能做但不如 Elixir 优雅 |
| **实时 Presence** | 需自己实现 | 可以用 celld KV 存储 |

### ❌ 难以等价实现

| Jido 功能 | 现状 | 原因 |
|----------|------|------|
| **BEAM 轻量级进程** | TS 没有百万级进程 | V8 isolate 也有开销但更重 |
| **Phoenix LiveView** | 没有完美 TS 等价 | LiveView 依赖 Elixir 编译模型 |
| **Phoenix Presence** | 需要自己实现 | 无内建 |
| **CloudEvents 路由** | 需自己实现 | agentos 路由能力弱 |

---

## 4. 实际可行的实现路径

### 目标: 实现一个 Jido Assembly 风格的 TS 框架

```
┌──────────────────────────────────────────────────────────┐
│           TS 实现（基于 Effect Agent + agentos）            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   ┌─────────────────────────────────────────────┐       │
│   │   agentos VM (V8 Isolates)                   │       │
│   │   - Agent Runtime                            │       │
│   │   - ACP Protocol (类似 Signal 路由)         │       │
│   └──────────────────┬────────────────────────┘       │
│                      │                                  │
│   ┌──────────────────▼────────────────────────┐       │
│   │   celld (D1/SQLite)                        │       │
│   │   - Rooms / Messages / Threads            │       │
│   │   - Sessions / Operations                  │       │
│   └──────────────────┬────────────────────────┘       │
│                      │                                  │
│   ┌──────────────────▼────────────────────────┐       │
│   │   Effect Agent (Jido.Agent 等价)           │       │
│   │   - Tool.make() (Action 等价)              │       │
│   │   - AgentRuntime.run                       │       │
│   │   - Schema-first (类型安全)                │       │
│   └──────────────────┬────────────────────────┘       │
│                      │                                  │
│   ┌──────────────────▼────────────────────────┐       │
│   │   UI (React + SSE)                          │       │
│   │   - 类似 Hologram 的 client-side actions   │       │
│   │   - SSE broadcasts                          │       │
│   │   - Real-time presence                      │       │
│   └─────────────────────────────────────────┘       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 步骤

1. **第一阶段**: 用 celld + agentos 实现 messaging (rooms/messages/threads)
2. **第二阶段**: 用 Effect Agent Tool.make() 实现 Actions
3. **第三阶段**: 用 agentos ACP 实现 Signal 路由
4. **第四阶段**: 用 React + SSE 实现 UI（替代 Hologram）
5. **第五阶段**: 集成 Jido.Chat 风格的 provider 适配器（Telegram/Discord）

---

## 5. sec v3 架构建议

基于 Jido Assembly 的启发，sec v3 可以演进为：

```
sec = local Jido Assembly

- sec = 一个 pi agent（celld + agentos + 多个 agents）
- sec = Effect Agent 的 Tool.make() 提供 actions
- sec = React UI 通过 SSE 实时显示 agent 状态
- sec = 集成到 multica 平台（类似 Jido Chat）
```

### 具体建议

1. **保留 sec CLI** - 作为 Hologram-style 的 client action 入口
2. **复用 celld** - 持久化 sessions/messages
3. **复用 agentos** - VM runtime + ACP protocol
4. **集成 multica** - 作为云端 Jido Chat 风格的 provider
5. **加入 React UI** - 替代 Hologram，显示 Signal 路由

---

## 6. 关键等价关系

| Jido/Elixir | TS 实现 |
|------------|---------|
| Jido.Agent | agentos + Effect Agent |
| Jido Signal | agentos ACP + pi-chord |
| Jido Messaging | celld D1/SQLite |
| Jido Action | Effect Agent Tool.make() |
| Jido AI | @rivet-dev/agentos (Pi/Claude) |
| Hologram | React + SSE (替代) |
| BEAM | V8 Isolates (类似但不等价) |
| OTP Supervision | 需自己实现 |
| Phoenix PubSub | celld Queue + SSE |
| Phoenix Presence | 需自己实现 |

---

## 7. 总结

**Jido/Elixir/OTP 的核心优势**：
- BEAM 轻量级进程（百万级）
- OTP 监督树（开箱即用）
- Phoenix LiveView（编译到 JS）
- CloudEvents 标准

**TS 框架能实现的部分**：
- ✅ Agent runtime（agentos）
- ✅ Storage（celld）
- ✅ Tool composition（Effect Agent）
- ✅ Signal routing（pi-chord + agentos ACP）
- ⚠️ UI 需要 React 替代 Hologram
- ❌ BEAM 进程模型无法完全等价

**sec v3 演进方向**：
- 保持 sec CLI 作为客户端入口
- 集成 celld + agentos 作为平台层
- 通过 multica 集成 Jido Chat 风格的 providers
- 添加 React UI 作为 Hologram 替代
