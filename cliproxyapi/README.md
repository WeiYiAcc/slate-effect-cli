# CLIProxyAPI (Local Copy)

This is a local copy of the CLIProxyAPI binary from the router-for-me project.

## Usage

```bash
# Start with the bundled config
./cli-proxy-api -config config.yaml -local-model

# Or with custom config
./cli-proxy-api -config /path/to/config.yaml -local-model
```

## Configuration

The `config.yaml` file configures the local CLIProxyAPI instance to listen on `127.0.0.1:7777`.

## Endpoints

- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - OpenAI-compatible chat completions
- `POST /v1/completions` - OpenAI-compatible completions

## Free Models Router

CLIProxyAPI provides access to free models through the `codex-free` catalog:
- `gpt-5.4-mini`
- `gpt-5.5`
- `gpt-5.6-terra`
- `gpt-5.6-luna`
- `codex-auto-review`

## Integration with Slate

To use this CLIProxyAPI as a model provider for Slate, configure the slate-effect-cli to point to this instance.
