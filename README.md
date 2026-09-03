# slate-effect-cli

Effect-native reconstruction of the [slate](https://github.com/randomlabs/slate) CLI using Effect Agent runtime model framework.

[中文 README](docs/zh.md)

## Overview

slate-effect-cli is an Effect.js-based CLI that implements the slate command interface. It uses CLIProxyAPI as the upstream model provider, with Free Models Router (OpenRouter) for free model access.

## Installation

```bash
# Clone the repository
cd /home/weiyiacc/slate-effect-cli

# Install dependencies
bun install
```

## CLI Interface (slate style)

### Direct Message Mode (slate run style)

```bash
# Run with prompt
sec run "请用中文解释 Effect.js"

# Use Free Models Router
sec --free "任务"

# Specify model
sec -m openrouter/openrouter/free "任务"

# With session
sec --session my-session "任务"

# Yolo mode (bypass permissions)
sec -y "任务"

# Non-interactive
sec --no-wait "任务"
```

### Subcommand Mode (backward compatible)

```bash
# Goal
sec goal "任务" --wait
sec goal "任务" --no-wait

# Session
sec session list
sec session create

# Model
sec model slots
sec model sets

# File
sec file ls
sec file status

# Other
sec ops health
sec perm list
sec workflow list
```

### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--model <id>` | `-m` | Model ID (default: openrouter/openrouter/free) |
| `--effort <level>` | `-e` | Thinking level (low/medium/high) |
| `--resume <id>` | `-r` | Resume session |
| `--session <name>` | `-s` | Session name |
| `--yolo` | `-y` | Bypass permissions |
| `--free` | | Use Free Models Router |
| `--provider <name>` | `-p` | Provider (default: cliproxyapi) |
| `--no-wait` | | Don't wait for completion |
| `--wait` | | Wait for completion (default) |
| `--timeout <sec>` | | Timeout in seconds |
| `--help` | `-h` | Show help |
| `--version` | `-v` | Show version |

## Architecture

```
slate-effect-cli/
├── src/
│   ├── index.ts           # CLI entry point (slate-style interface)
│   ├── commands/          # Command implementations
│   │   ├── goal/          # Goal execution
│   │   ├── session/       # Session management
│   │   ├── model/         # Model management
│   │   └── ...
│   ├── providers/         # Model providers
│   │   └── cliproxyapi.ts # CLIProxyAPI provider
│   ├── engine/            # Effect engine
│   └── types/             # Type definitions
├── cliproxyapi/           # CLIProxyAPI binary & config
└── docs/
    ├── usage.md
    └── extension.md
```

## CLIProxyAPI Integration

- **Provider**: CLIProxyAPI at `http://127.0.0.1:8317`
- **Free Models Router**: OpenRouter via CLIProxyAPI
- **Working model**: `openrouter/openrouter/free`
- **API Key**: From auth.json (`ak7548697`)

## Running

```bash
# Start the CLI server
bun run src/index.ts serve

# Use the sec command (wrapper)
sec "任务" --free true
```
