
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Layer, Redacted, Schema } from "effect";
import { Agent, AgentRuntime } from "effect-agent";
import { AgentPolicy } from "effect-agent/AgentPolicy";
import { ThreadHistory } from "effect-agent/ThreadHistory";
import { IdGenerator } from "effect-agent/IdGenerator";
import { Toolkit } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";

// Simple string input/output agent
const helloAgent = Agent.make("hello", {
  input: Schema.String,
  output: Schema.String,
  instructions: "Reply with a simple greeting.",
  toolkit: Toolkit.empty,
  policy: AgentPolicy.make({
    maxTurns: 1,
    maxToolCalls: 0,
    maxDuration: "30 seconds",
    toolConcurrency: 1,
  }),
});

async function test() {
  try {
    const result = await Effect.runPromise(
      AgentRuntime.run(helloAgent, "Hello!").pipe(
        Effect.tap((result) => Console.log("OUTPUT:", result.output)),
        Effect.provide(OpenAiLanguageModel.model("openrouter/openrouter/free")),
        Effect.provide(OpenAiClient.layer({
          apiKey: Redacted.make("ak-local-cpa"),
          apiUrl: "http://127.0.0.1:8317"
        })),
        Effect.provide(FetchHttpClient.layer),
        Effect.provide(IdGenerator.layer),
        Effect.provide(ThreadHistory.layerTransient),
      )
    )
    console.log("Final result:", result.output)
  } catch (e) {
    console.log("Error:", JSON.stringify(e, null, 2))
  }
}

test()
