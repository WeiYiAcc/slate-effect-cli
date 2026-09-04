## Issue Description

The `@effect/ai-openai` ResponseStreamEvent schema is missing several SSE event types that are part of the OpenAI Responses API specification, causing "Invalid output" errors when streaming with providers like OpenRouter/gproxy.

## Environment

- `@effect/ai-openai`: 4.0.0-rc.112
- `effect`: 4.0.0-rc.112
- `effect-agent`: 0.1.0-beta.47

## Reproduction

### Test Code
```typescript
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Redacted, Schema } from "effect";
import { Agent, AgentRuntime } from "effect-agent";
import { AgentPolicy } from "effect-agent/AgentPolicy";
import { ThreadHistory } from "effect-agent/ThreadHistory";
import { IdGenerator } from "effect-agent/IdGenerator";
import { Toolkit } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";

const helloAgent = Agent.make("hello", {
  input: Schema.String,
  output: Schema.Struct({ greeting: Schema.String }),
  instructions: 'Respond with JSON like {"greeting": "..."}',
  toolkit: Toolkit.empty,
  policy: AgentPolicy.make({ maxTurns: 1, maxToolCalls: 1, maxDuration: "30 seconds", toolConcurrency: 1 }),
});

const program = AgentRuntime.run(helloAgent, "Say hi!").pipe(
  Effect.provide(OpenAiLanguageModel.model("openrouter/openrouter/free")),
  Effect.provide(OpenAiClient.layer({
    apiKey: Redacted.make("<your-key>"),
    apiUrl: "https://your-proxy/v1"
  })),
  Effect.provide(FetchHttpClient.layer),
  Effect.provide(IdGenerator.layer),
  Effect.provide(ThreadHistory.layerTransient),
);

BunRuntime.runMain(program);
```

### Error Output
```
ERROR: OpenAiClient.createResponseStream: Invalid output: Expected a valid JSON string
  at [3]["data"]["item"]
Expected UnknownResponseStreamEvent
```

The error occurs at different event indices (varies between runs).

## Root Cause Analysis

### SSE Events Sent by OpenRouter/gproxy

When streaming from OpenRouter (via gproxy), the SSE stream includes these event types:

| Event Type | Status |
|------------|--------|
| response.created | supported |
| response.in_progress | supported |
| response.output_item.added | supported |
| response.output_item.done | supported |
| **response.content_part.added** | **MISSING** |
| **response.content_part.done** | **MISSING** |
| response.output_text.delta | supported |
| **response.reasoning_text.delta** | **MISSING** |
| **response.reasoning_text.done** | **MISSING** |
| response.reasoning_summary_part.added | supported |

### Missing Event Schemas

1. **`response.content_part.added`** - Sent when a content part (like output_text or reasoning_text) begins
   ```json
   {"type":"response.content_part.added","output_index":0,"item_id":"rs_tmp_xxx","content_index":0,"part":{"type":"reasoning_text","text":""}}
   ```

2. **`response.content_part.done`** - Sent when a content part completes
   ```json
   {"type":"response.content_part.done","output_index":0,"item_id":"rs_tmp_xxx","content_index":0,"part":{"type":"reasoning_text","text":"..."}}
   ```

3. **`response.reasoning_text.delta`** - Sent during reasoning (when reasoning is enabled)
   ```json
   {"type":"response.reasoning_text.delta","output_index":0,"item_id":"rs_tmp_xxx","content_index":0,"delta":"thinking..."}
   ```

4. **`response.reasoning_text.done`** - Sent when reasoning completes

## Expected Behavior

The ResponseStreamEvent schema should support all event types defined in the OpenAI Responses API specification, particularly the content_part events which are commonly emitted by OpenAI-compatible providers.

## Additional Notes

1. The `knownResponseStreamEventTypes` set in OpenAiSchema.js contains 18 event types, but is missing the content_part events
2. This affects any OpenAI-compatible provider that follows the full Responses API spec (OpenRouter, gproxy, Azure AI, etc.)
