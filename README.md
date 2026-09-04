# sec - Effect Agent CLI

基于 Effect Agent 运行时模型的命令行 AI 工具。

## 技术栈

- **Effect Agent Runtime**: `@effect-agent/core` + `@effect-agent/engine`
- **AI Provider**: `@effect/ai-openrouter@4.0.0-rc.112`
- **Runtime**: Bun + TypeScript

## 架构

```
sec CLI (@effect/ai-openrouter)
    ↓ HTTP POST /v1/chat/completions
cliproxyapi (127.0.0.1:8317)
    ├─ 认证密钥: ak-local-cpa
    ├─ owned_by: "gproxy" (gproxy 透传层)
    ↓ 透传
gproxy (100.110.98.84:8787)
    ├─ 认证密钥: ak7548697
    ├─ 路由 "openrouter/openrouter/free" 模型
    ↓ 转发
OpenRouter API
    ↓
minimax/minimax-m3:free
```

### 关键说明

1. **使用 `@effect/ai-openrouter` 而不是 `@effect/ai-openai`**：
   - `@effect/ai-openai` 使用 OpenAI Responses API (`/v1/responses`)
   - `@effect/ai-openrouter` 使用 Chat Completions API (`/v1/chat/completions`)
   - Chat Completions API 避免了 SSE schema 不兼容问题

2. **通过 cliproxyapi 透传而不是直接连接 OpenRouter**：
   - 本地服务 `127.0.0.1:8317` 作为认证网关
   - cliproxyapi 是 gproxy 的透传层（models 响应显示 `owned_by: "gproxy"`）
   - 最终由 gproxy 连接 OpenRouter 并路由到实际模型

3. **实际模型**：
   - 配置模型: `openrouter/openrouter/free`
   - 实际模型: `minimax/minimax-m3:free`

## 安装

```bash
cd /home/weiyiacc/slate-effect-cli
bun install
```

## 配置

当前硬编码配置（后续改为配置文件）：

```typescript
// src/index.ts
const CLIPROXY_URL = "http://127.0.0.1:8317/v1";
const CLIPROXY_KEY = "ak-local-cpa";
const MODEL = "openrouter/openrouter/free";
```

## 使用

```bash
# 单次请求
sec run "What is 2+2?"

# 后台任务
sec run --background "long task"
sec status <job_id>

# 多轮对话
sec chat
# 或指定会话
sec chat --session <session_id>

# 会话管理
sec session new "my-project"
sec session list
sec session show <session_id>
sec session rm <session_id>

# 后台任务管理
sec jobs list
sec jobs rm <job_id>
```

## 开发

```bash
# 运行测试
bun run src/index.ts run "test"

# 调试 Effect Agent
bun run test-openrouter-math.ts
```

## 相关文档

- [Effect Agent 文档](https://effect-agent.com/guide/getting-started)
- [@effect/ai-openrouter npm](https://www.npmjs.com/package/@effect/ai-openrouter)
- [OpenRouter](https://openrouter.ai/)
