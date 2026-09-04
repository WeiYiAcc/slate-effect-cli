# Agent 组件原语对比文档

## 核心观点

**pi = cell + agentos + 多 agents 的本地等价实现**

| 组件 | 定位 | pi 对应 | celld/agentos 对应 |
|------|------|---------|-------------------|
| **Storage** | 持久化 | `pi-session-backend-sqlite-node` | `celld` (D1/KV) |
| **Runtime** | Agent 执行 | `pi-agent-core` | `agentos` (V8 isolates) |
| **Protocol** | 通信 | `pi-ai` (providers) | agentos 内置 |
| **Transport** | 传输层 | `pi-chord` (facet-service) | agentos ACP |

---

## 1. pi packages 架构

### packages/agent - Agent 核心
```typescript
import { Agent } from "@earendil-works/pi-agent-core";

const agent = new Agent({
  initialState: { systemPrompt, model },
  streamFn: models.streamSimple.bind(models),
});

// Event-driven
agent.subscribe((event) => {
  if (event.type === "message_update") {
    process.stdout.write(event.delta);
  }
});

await agent.prompt("Hello!");
```

### packages/ai - AI Provider
```typescript
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());
const model = models.getModel("anthropic", "claude-sonnet-4-6");
```

### packages/chord - Transport Layer
- Transport-neutral facet-service primitives
- 支持多种传输协议

### packages/client - Client SDK
- 连接远程 agent 服务

---

## 2. celld - 分布式存储

**定位**: Durable Objects 风格的分布式存储

### 原语
| 原语 | 说明 |
|------|------|
| `KV` | 键值存储 |
| `D1` | SQLite 数据库 |
| `Queue` | 消息队列 |
| `Bucket` | S3/GS/AZ 对象存储 |
| `Peer` | P2P 节点 |

### 等价的 pi 实现
```
celld KV      → pi-session-backend (in-memory map)
celld D1      → pi-session-backend-sqlite-node
celld Queue   → 不需要（agent 内部处理）
celld Bucket  → 不需要（session 文件）
```

---

## 3. agentos - Agent 运行时

**定位**: V8 isolates 的轻量级 VM

### 原语
```typescript
import { agentOS, setup } from "@rivet-dev/agentos";
import pi from "@agentos-software/pi";

const vm = agentOS({ software: [pi] });
const registry = setup({ use: { vm } });
registry.start();

// Client
const handle = client.vm.getOrCreate("my-agent");
await handle.openSession({ agent: "pi", env });
await handle.prompt({ content: "..." });
```

### 等价的 pi 实现
```
agentos vm        → pi-agent-core (Node.js)
agentos ACP      → pi-chord (facet-service)
agentos Pi       → pi-agent-core 内置
agentos Claude Code → 不在内核，通过 ACP 扩展
```

---

## 4. pi harness v2 - 持久化框架

**定位**: 本地文件存储的 pi session 管理

### 三个 Store (from harness.md)
| Store | 类型 | pi 实现 |
|-------|------|---------|
| `entries` | write-once | Session messages[] |
| `values/lists` | mutable | Session state |
| `usage` | append-only | Usage ledger |

### Operation State Machine
```
starting → checkpoint → assistant.ready → assistant.effect_pending
         → tools → summary.* → navigation.*
```

### 关键 API
```typescript
// Accept
accept(request: OperationRequest): OperationAdmissionResult

// Drive
drive(operationId, options?): DriveResult

// Abort
requestAbort(operationId): AbortRequestResult

// Inspect
inspectExecution(): LaneExecutionInfo
```

---

## 5. sec CLI - 当前实现

**定位**: 本地 CLI + multica 集成

### 当前架构
```
sec CLI
├── Effect Agent Runtime (@effect-agent)
├── @effect/ai-openrouter (AI Provider)
└── cliproxyapi → gproxy → OpenRouter
```

### 当前命令
```bash
sec run <prompt>          # 单次调用
sec chat                   # 交互式 REPL
sec session new|list|... # Session 管理
sec agent list|status     # multica agents
sec issue list|create    # multica issues
sec runtime list          # multica runtimes
sec models               # 可用模型
```

### 存储
- `~/.local/share/sec/sessions/` - Session JSON
- `~/.local/share/sec/runtime/` - Job JSON

---

## 6. multica - 云端平台

**定位**: celld + agentos + 多 agent 的统一平台

### 原语
```bash
multica agent          # Pi/Claude/Codex/Hermes
multica issue         # Issue 追踪
multica squad         # 多 agent 协作
multica runtime       # Runtime 实例
multica skill         # Skill 管理
multica autopilot     # 定时任务
```

### 等价关系
```
multica agent    → celld KV + agentos Pi/Claude/Codex
multica issue    → celld D1
multica squad    → agentos multi-agent
multica runtime  → agentos VM instances
multica skill    → pi-agent-core hooks
multica autopilot → celld Queue
```

---

## 7. sec-cell - Cloudflare 实现

**定位**: celld + agentos 的 Cloudflare Workers 部署

### 架构
```
sec-cell/
├── actor-service.mjs    # 简化的 Actor
├── agentos-service.mjs  # agentos Worker
└── wrangler.jsonc      # Cloudflare 配置
```

---

## 组件关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        celld (分布式存储)                           │
│              KV / D1 / Queue / Bucket / Peer                      │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                    agentos (Agent 运行时)                           │
│        V8 Isolates / ACP Protocol / Pi / Claude / Codex              │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  sec-cell │   │ multica   │   │ pi harness│
            │(CF Worker)│   │ (云端)     │   │ (本地)     │
            └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
                  │              │               │
                  │              │               │
                  └──────────────┴───────────────┘
                                   │
                                   ▼
                          ┌───────────────┐
                          │    sec CLI    │
                          │ (本地 CLI 工具)│
                          └───────────────┘
```

---

## 设计对比

| 维度 | celld | agentos | pi harness | multica | sec CLI |
|------|-------|---------|------------|---------|---------|
| **存储** | D1/KV | 无 | SQLite | D1/KV | JSON 文件 |
| **Agent** | 无 | Pi/Claude | Pi | 多 agent | 无 |
| **部署** | Workers | 任意 Node | 本地 | 云端 | 本地 |
| **协议** | HTTP | ACP | 内部 | ACP/HTTP | Effect |
| **多租户** | 是 | 是 | 否 | 是 | 否 |

---

## 关键等价关系总结

### 存储层
```
celld D1     ↔  pi-session-backend-sqlite-node
celld KV     ↔  Session state (in-memory)
celld Queue ↔  Agent 内部队列
```

### 运行时
```
agentos V8    ↔  pi-agent-core (Node.js)
agentos ACP  ↔  pi-chord (facet-service)
agentos Pi    ↔  pi-agent-core 内置
```

### 持久化
```
pi harness   ↔  celld + agentos 的本地化
- entries   ↔  D1 rows
- values    ↔  KV
- usage     ↔  Usage ledger
```

### multica = 云端完整实现
```
multica = celld (存储) + agentos (运行时) + Pi/Claude/Codex/Hermes (agents)
```

### sec CLI = 本地轻量代理
```
sec CLI = multica 的本地 CLI 包装
        = pi-agent-core 的 Effect Agent 实现
```

---

## 下一步: sec v2 架构

基于以上分析，sec v2 应该：

1. **保持简单**: 不内嵌 celld/agentos 的复杂性
2. **集成 multica**: 作为本地 multica 客户端
3. **借鉴 pi harness**: 三个 Store 设计
4. **Effect Agent**: 作为 AI Provider 的解耦层
