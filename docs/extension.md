# 扩展指南

## 概述

slate-effect-cli 已预留扩展点，支持未来聚合更多免费模型渠道（如 Vercel、OpenCodezen 等）。

---

## 当前架构

### Free Models Router 链路

```
用户: --free true
    ↓
src/commands/goal/index.ts
    ↓ runGoalWithFreeModels()
src/providers/cliproxyapi.ts
    ↓
    ├── selectFreeModel()     ← 模型选择逻辑
    ├── getFreeModelsConfig() ← 配置获取
    └── chatCompletion()     ← HTTP 请求
    ↓
CLIProxyAPI (127.0.0.1:8317)
    ↓
gproxy (100.110.98.84:8787)
    ↓
OpenRouter / Free Models Router
```

---

## 扩展方向

### 1. 多渠道免费模型聚合

**目标**: 支持 `--router-channel` 参数，选择不同免费渠道：

```bash
# 使用 OpenRouter Free Router（当前）
bun run src/index.ts goal --router-channel openrouter-free "任务"

# 使用 Vercel 免费渠道
bun run src/index.ts goal --router-channel vercel-free "任务"

# 使用 OpenCodezen 免费渠道
bun run src/index.ts goal --router-channel opencodezen-free "任务"
```

**实现步骤**:

1. **修改 `src/commands/goal/index.ts`** - 添加 `--router-channel` 标志：

```typescript
// 添加新标志解析
const routerChannel = flags['router-channel'] as string | undefined;
```

2. **修改 `src/providers/cliproxyapi.ts`** - 更新 `getFreeModelsConfig` 返回不同渠道的模型列表：

```typescript
export function getFreeModelsConfig(channel?: string): CliproxyapiConfig {
  const freeModelsByChannel = {
    'openrouter-free': ['openrouter/openrouter/free'],
    'vercel-free': [
      'vercel-ai-gateway/openai/gpt-5.6-luna',
      'vercel-ai-gateway/openai/gpt-5.5',
      // ... 更多 Vercel 免费模型
    ],
    'opencodezen-free': [
      'opencodezen/gpt-5.6-luna',
      'opencodezen/gpt-5.5',
      // ... 更多 OpenCodezen 免费模型
    ],
  };
  
  return {
    // ... 基础配置
    freeModels: freeModelsByChannel[channel || 'openrouter-free'],
  };
}
```

3. **修改 `selectFreeModel`** - 根据渠道选择模型：

```typescript
export const selectFreeModel = (channel?: string) => Effect.gen(function* () {
  const config = getFreeModelsConfig(channel);
  
  // 轮询选择或权重选择
  const index = Math.floor(Date.now() / 10000) % config.freeModels.length;
  const modelId = config.freeModels[index];
  
  return { modelId, providerId: config.providerId, providerName: config.providerName };
});
```

### 2. 添加新的 Provider

**场景**: 对接除了 CLIProxyAPI 之外的其他模型网关（如本地 Ollama、自建网关等）。

**实现步骤**:

1. 在 `src/providers/` 下创建新 provider 文件（如 `ollama.ts`）：

```typescript
// src/providers/ollama.ts
import { Effect } from "effect";

export const OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export const chatCompletion = (model: string, messages: any[]) =>
  Effect.promise(() =>
    fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
    }).then(r => r.json())
  );
```

2. 在 `src/commands/goal/index.ts` 中添加 `--provider ollama` 分支：

```typescript
if (flags.provider === "ollama") {
  await runGoalWithOllama(objective);
  return;
}
```

### 3. 添加新的 Command Group

**场景**: 添加 `cache`、`export`、`import` 等新功能。

**实现步骤**:

1. 创建 `src/commands/<name>/index.ts`
2. 在 `src/index.ts` 的 `switch` 中添加 case
3. 在 imports 中添加新命令

```typescript
// src/commands/cache/index.ts
export async function run(subcommand: string | undefined, args: string[], flags: Record<string, string | boolean>) {
  // 实现缓存管理逻辑
}

// src/index.ts
import { run as cacheRun } from "./commands/cache/index.ts";

switch (group) {
  // ... 其他 case
  case "cache":
    await cacheRun(subcommand, args, flags);
    break;
}
```

### 4. 自定义模型选择策略

**当前**: 简单的轮询（round-robin）

**可扩展**: 权重选择、最快响应优先、成本优先等

```typescript
// src/providers/cliproxyapi.ts

// 按响应速度选择（需配合健康检查）
export const selectFastestModel = Effect.gen(function* () {
  const config = getFreeModelsConfig();
  
  // 并发探测所有模型
  const results = yield* Effect.all(
    config.freeModels.map(model => 
      Effect.promise(() => pingModel(model)).pipe(
        Effect.map(success => success ? model : null)
      )
    )
  );
  
  const available = results.filter(Boolean);
  if (available.length === 0) {
    return yield* Effect.fail(new Error("No models available"));
  }
  
  return available[0];
});
```

---

## 配置参考

### CLIProxyAPI 配置 (`~/.config/cpa-local/config.yaml`)

```yaml
host: "127.0.0.1"
port: 8317
api-keys:
  - "ak-local-cpa"

# 上游网关配置
openai-compatibility:
  - name: gproxy
    base-url: http://100.110.98.84:8787/v1
    headers:
      Authorization: "Bearer ak7548697"
    models:
      # OpenRouter Free Router
      - name: openrouter/openrouter/free
        
      # Vercel 渠道
      - name: vercel-ai-gateway/openai/gpt-5.6-luna
      - name: vercel-ai-gateway/openai/gpt-5.5
        
      # OpenCodezen 渠道
      - name: opencodezen/gpt-5.6-luna
      - name: opencodezen/gpt-5.5
        
      # 更多模型...
```

### systemd 服务配置

```ini
[Unit]
Description=CLIProxyAPI local agent gateway
After=network-online.target

[Service]
WorkingDirectory=%h/.config/cpa-local
ExecStart=%h/.local/bin/cli-proxy-api --config config.yaml
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=default.target
```

---

## 相关项目

| 项目 | 用途 |
|------|------|
| [my-local-agent-gateway-cliproxyapi](https://github.com/WeiYiAcc/my-local-agent-gateway-cliproxyapi) | CLIProxyAPI 配置与 systemd 服务 |
| [my-gproxy](https://github.com/WeiYiAcc/my-gproxy) | VPS gproxy 路由聚合配置 |
| [cli-proxy-api](https://github.com/router-for-me/cli-proxy-api) | CLIProxyAPI 核心二进制 |
