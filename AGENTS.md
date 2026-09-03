# AGENTS.md - slate-effect-cli

## Project Info
- **项目**: slate-effect-cli (Effect.js 实现的 slate CLI)
- **路径**: /home/weiyiacc/slate-effect-cli
- **CLI 命令**: sec (wrapper script at ~/.local/bin/sec)

## CLI Interface
- **风格**: slate run style (opencode fork, Claude Code 兼容)
- **命令**: sec run [prompt] 或 sec [options] [prompt]
- **默认模型**: openrouter/openrouter/free
- **模型提供商**: CLIProxyAPI (http://127.0.0.1:8317)

## Key Files
- `src/index.ts` - CLI entry point
- `src/commands/goal/index.ts` - Goal execution
- `src/providers/cliproxyapi.ts` - CLIProxyAPI provider
- `cliproxyapi/` - CLIProxyAPI binary and config

## Running Tests
```bash
# Test CLI
sec --help
sec --version
sec --free "任务" --no-wait
sec goal "任务" --wait

# Test server
bun run src/index.ts ops health
```

## Notes
- Use `sec` command (not `slate`) to avoid conflict with original slate
- CLIProxyAPI must be running (systemd service cpa-local)
- Original slate is opencode fork, not Claude Code itself
- Multica uses claude protocol to call slate
