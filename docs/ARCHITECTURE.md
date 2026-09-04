# sec CLI 架构对比文档

本文档对比 sec CLI 及其相关组件（celld、agentos、pi harness、multica）的原语和定位。

## 1. celld - 分布式 Durable Objects

**定位**: 分布式存储基础设施（KV/D1/队列）

### 原语
| 原语 | 说明 |
|------|------|
| `KV` | 键值存储，支持 namespace |
| `D1` | SQLite 数据库 |
| `Queue` | 消息队列，支持 dead-letter |
| `Bucket` | S3/GS/AZ 兼容的对象存储 |
| `Peer` | P2P 节点发现 |

### 特性
- 分布式，水平扩展
- 支持多后端（S3/Cloudflare D1/Azure）
- Peer 网络自愈

---

## 2. agentos - 轻量级 VM Agent 运行时

**定位**: 进程内 VM，提供 agent 运行时

### 原语
| 原语 | 说明 |
|------|------|
| `vm.agentOS()` | 创建 VM 实例 |
| `vm.getOrCreate()` | 获取或创建 agent |
| `handle.openSession()` | 打开持久 session |
| `handle.prompt()` | 发送 prompt |
| `conn.on(''event'')` | 事件订阅 |

### 支持的 Agents
- **Pi** - 通用 agent
- **Claude Code** - Anthropic CLI
- **Codex** - OpenAI CLI  
- **OpenCode** - OpenCode agent

### 特性
- V8 isolates（无容器）
- 细粒度权限控制
- 内置 ACP (Agent Client Protocol)
- 毫秒级冷启动

---

## 3. pi harness v2 - 持久化 Agent 运行时

**定位**: pi agent 的持久化框架（本地文件存储）

### 三个 Store
| Store | 类型 | 说明 |
|-------|------|------|
| `entries` | write-once | Conversation tree（message/compaction/branch_summary/custom）|
| `values/lists` | mutable | Session 状态（name/model/operation state）|
| `usage` | append-only | 成本记录 |

### Operation State Machine (13 leaves)
```
starting → checkpoint → assistant.ready → assistant.effect_pending
         → tools → summary.deciding → summary.ready → ...
         → navigation.ready_to_commit
```

### Lane/Branch 原语
| 原语 | 说明 |
|------|------|
| `accept(request)` | 接受操作 |
| `drive()` | 执行操作 |
| `requestAbort()` | 请求中断 |
| `inspectExecution()` | 查询状态 |

---

## 4. sec-cell - celld + agentos 的 Cloudflare Workers 实现

**定位**: 云端 agent 服务

### 架构
- `actor-service.mjs` - 简化的 Actor 服务
- `agentos-service.mjs` - agentos Cloudflare Worker
- `wrangler.jsonc` - 部署配置

### 原语
- 使用 celld 的 KV/D1/Queue
- agentos 提供 Pi/Claude Code 运行时
- 支持 Cloudflare Workers 部署

---

## 5. sec CLI - Effect Agent CLI

**定位**: 本地 CLI 工具（基于 Effect Agent）

### 架构
```
sec CLI (@effect/ai-openrouter)
├── Effect Agent Runtime
├── OpenRouter Provider
└── cliproxyapi (VPS)
```

### 原语（当前）
| 原语 | 说明 |
|------|------|
| `sec run <prompt>` | 单次 AI 调用 |
| `sec chat` | 交互式 REPL |
| `sec session` | Session 管理 |
| `sec agent list` | Multica agents |
| `sec issue list` | Multica issues |
| `sec models` | 列出可用模型 |

### 存储
- `~/.local/share/sec/sessions/` - Session JSON 文件
- `~/.local/share/sec/runtime/` - Job JSON 文件

---

## 6. multica - 云端 Agent 平台

**定位**: 多 agent 协作平台

### 原语
| 原语 | 说明 |
|------|------|
| `multica agent` | Agent 管理 |
| `multica issue` | Issue 追踪 |
| `multica squad` | 多 agent 协作 |
| `multica runtime` | Runtime 实例 |
| `multica skill` | Skill 管理 |
| `multica autopilot` | 定时任务 |

---

## 组件关系图

```
                    ┌─────────────────────────────────────────┐
                    │        celld (Durable Objects)          │
                    │   KV / D1 / Queue / Bucket / Peer      │
                    └──────────────────┬──────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────┐
                    │       agentos (VM Runtime)              │
                    │  Pi / Claude Code / Codex / OpenCode    │
                    │  ACP Protocol / V8 Isolates            │
                    └──────────────────┬──────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
┌─────────────────┐      ┌─────────────────────┐      ┌─────────────────┐
│   sec-cell      │      │   multica (云端)    │      │   pi harness    │
│ (Cloudflare)    │      │   celld + agentos   │      │  (本地文件)     │
└────────┬────────┘      └─────────┬───────────┘      └─────────────────┘
         │                         │
         │    ┌────────────────────┘
         │    │
         ▼    ▼
┌─────────────────┐
│    sec CLI      │
│  Effect Agent  │
│  + multica 集成 │
└─────────────────┘
```

---

## 设计决策对比

| 维度 | celld | agentos | pi harness | sec CLI |
|------|-------|---------|------------|---------|
| **存储** | 分布式 KV/D1 | 分布式 | 本地文件 | 本地 JSON |
| **Agent** | 无 | Pi/Claude/Codex | Pi only | 无（Provider）|
| **持久化** | Durable Objects | Durable Objects | 文件 | 文件 |
| **协议** | HTTP/WS | ACP | 内部 | Effect |
| **部署** | Cloudflare Workers | 任意 Node | 本地 | 本地 |
| **多租户** | 是 | 是 | 否 | 否 |

---

## sec v2 设计方向

基于以上分析，sec CLI v2 应该：

1. **保持简单**: 不需要引入 celld/agentos 的复杂性
2. **借鉴 pi harness**: 三个 Store 设计
3. **集成 multica**: 通过 CLI 调用，不是内置
4. **保持 Effect Agent**: Provider 解耦

### 各组件的等价关系

| 组件 | 角色 | sec 中的对应 |
|------|------|------------|
| celld | 存储层 | 不需要（本地文件足够）|
| agentos | Agent 运行时 | Effect Agent Runtime |
| pi harness | 持久化框架 | Session JSON 文件 |
| multica | 多 agent 协作 | 通过 `sec agent/issue/squad` 调用 |
| sec | 本地 CLI | 本项目 |

### 关键发现

**重要观察**：
- **pi harness 本身 = 一个 cell + agentos + 多个 agent** 的等价物（本地化）
- **multica = 云端 celld + agentos + pi + Claude Code + Codex + ...** 的统一平台
- **sec CLI 应该 = multica 的本地轻量代理**（只调用，不内嵌）
