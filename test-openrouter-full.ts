
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Layer, Redacted, Schema } from "effect";
import { Agent, AgentRuntime } from "effect-agent";
import { AgentPolicy } from "effect-agent/AgentPolicy";
import { ThreadHistory } from "effect-agent/ThreadHistory";
import { IdGenerator } from "effect-agent/IdGenerator";
import { Toolkit } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";

const helloAgent = Agent.make("hello", {
  input: Schema.String,
  output: Schema.Struct({
    result: Schema.String,
  }),
  instructions: "Respond with a simple greeting.",
  toolkit: Toolkit.empty,
  policy: AgentPolicy.make({
    maxTurns: 2,
    maxToolCalls: 1,
    maxDuration: "30 seconds",
    toolConcurrency: 1,
  }),
});

const program = AgentRuntime.run(helloAgent, "Hi there!").pipe(
  Effect.tap((result) => Console.log("OUTPUT:", JSON.stringify(result.output))),
  Effect.provide(OpenAiLanguageModel.model("openrouter/free")),
  Effect.provide(OpenAiClient.layer({
    apiKey: Redacted.make("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"),
    apiUrl: "https://openrouter.ai/api/v1"
  })),
  Effect.provide(FetchHttpClient.layer),
  Effect.provide(IdGenerator.layer),
  Effect.provide(ThreadHistory.layerTransient),
);

BunRuntime.runMain(program);
