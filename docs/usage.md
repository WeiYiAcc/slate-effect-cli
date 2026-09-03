# slate-effect-cli 使用手册

## 快速开始

```bash
# 进入项目目录
cd /home/weiyiacc/slate-effect-cli

# 运行目标命令（使用 Free Models Router）
bun run src/index.ts goal --free true "请用中文打招呼"
```

---

## 命令格式

```bash
bun run src/index.ts <group> <command> [args] [flags]
```

---

## 命令组 (Groups)

| 组 | 说明 | 示例 |
|-----|------|------|
| `goal` | 目标执行（核心功能） | `goal --free true "任务描述"` |
| `session` | 会话管理 | `session list`, `session create "名称"` |
| `workflow` | 工作流管理 | `workflow list`, `workflow cancel <id>` |
| `model` | 模型管理 | `model slots`, `model sets` |
| `file` | 文件操作 | `file ls <path>`, `file status <path>` |
| `find` | 搜索 | `find text "关键词"`, `find files "*.ts"` |
| `events` | 事件监听 | `events watch` |
| `ops` | 运维操作 | `ops health`, `ops path` |

---

## 常用命令示例

### goal - 目标执行（核心）

```bash
# 使用 Free Models Router（默认）
bun run src/index.ts goal --free true "用中文解释 Effect.js"

# 不等待，直接返回 sessionId
bun run src/index.ts goal --free true --no-wait "后台任务"

# 指定超时时间
bun run src/index.ts goal --free true --timeout 600 "长任务"

# 指定模型（需确认 gproxy 上可用）
bun run src/index.ts goal --model openrouter/openrouter/free "指定模型"
```

### session - 会话管理

```bash
# 列出所有会话
bun run src/index.ts session list

# 创建新会话
bun run src/index.ts session create "我的测试会话"

# 查看会话消息
bun run src/index.ts session messages <sessionId>

# 删除会话
bun run src/index.ts session rm <sessionId>

# 中止会话
bun run src/index.ts session abort <sessionId>
```

### model - 模型管理

```bash
# 查看可用模型槽位
bun run src/index.ts model slots

# 查看模型集合
bun run src/index.ts model sets

# 设置默认模型
bun run src/index.ts model set-default <modelId>
```

### file - 文件操作

```bash
# 列出目录
bun run src/index.ts file ls /tmp

# 查看文件状态
bun run src/index.ts file status /path/to/file

# 查看文件内容
bun run src/index.ts file cat /path/to/file
```

### ops - 运维操作

```bash
# 健康检查
bun run src/index.ts ops health

# 查看路径配置
bun run src/index.ts ops path

# 查看 VCS 状态
bun run src/index.ts ops vcs

# 查看配置
bun run src/index.ts ops config
```

---

## 标志 (Flags) 说明

| 标志 | 说明 | 默认值 |
|------|------|--------|
| `--free true` | 启用 Free Models Router | `false` |
| `--model <id>` | 直接指定模型 ID | 自动选择 |
| `--provider <name>` | 指定提供商 | - |
| `--wait` | 等待任务完成 | `true` |
| `--no-wait` | 不等待，直接返回 | - |
| `--timeout <sec>` | 超时时间（秒） | `3600` |
| `--url <url>` | 指定 Slate 服务器地址 | 自动发现 |
| `--dir <path>` | 指定工作目录 | 当前目录 |

---

## 故障排查

### 检查服务状态

```bash
# 1. 检查 CLIProxyAPI 是否运行
systemctl --user status cpa-local

# 2. 检查端口可达性
curl -H "Authorization: Bearer ak-local-cpa" http://127.0.0.1:8317/v1/models

# 3. 检查 gproxy 可达性
curl -H "Authorization: Bearer ak7548697" http://100.110.98.84:8787/v1/models
```

### 常见错误

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `error: undefined` | 可能是日志被截断，实际可能成功 | 检查是否有 `Response:` 输出 |
| `no available members` | 所选模型在 gproxy 上无可用后端 | 改用 `openrouter/openrouter/free` |
| `unknown provider for model` | 模型名拼写错误 | 检查 `/v1/models` 中的正确模型名 |

---

## 服务架构

```
slate-effect-cli
    ↓
CLIProxyAPI (127.0.0.1:8317)
    ↓
gproxy (100.110.98.84:8787)
    ↓
Free Models Router / OpenRouter
```

### 配置文件位置

- CLIProxyAPI 配置: `~/.config/cpa-local/config.yaml`
- systemd 服务: `~/.config/systemd/user/cpa-local.service`
- 二进制文件: `~/.local/bin/cli-proxy-api`
