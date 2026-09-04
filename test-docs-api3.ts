
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Layer, Schema } from "effect";
import { Agent, AgentRuntime } from "effect-agent";
import { AgentPolicy } from "effect-agent/AgentPolicy";
import { ThreadHistory } from "effect-agent/ThreadHistory";
import { IdGenerator } from "effect-agent/IdGenerator";
import { Toolkit } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";
import * as Config from "effect/Config"

const triage = Agent.make("triage", {
  input: Schema.String,
  output: Schema.Struct({
    severity: Schema.Literals(["low", "medium", "high", "critical"]),
    explanation: Schema.String,
  }),
  instructions: "Classify the bug report by severity. Explain your reasoning in one sentence.",
  toolkit: Toolkit.empty,
  policy: AgentPolicy.make({
    maxTurns: 2,
    maxToolCalls: 1,
    maxDuration: "30 seconds",
    toolConcurrency: 1,
  }),
});

async function test() {
  try {
    const result = await Effect.runPromise(
      AgentRuntime.run(triage, "All users get a 500 error when signing in.").pipe(
        Effect.tap((result) => Console.log("OUTPUT:", JSON.stringify(result.output))),
        Effect.provide(OpenAiLanguageModel.model("openrouter/openrouter/free")),
        Effect.provide(Layer.effect(OpenAiClient).pipe(
          Layer.provide(OpenAiClient.config({
            apiKey: Config.redacted("ak-local-cpa"),
            apiUrl: Config.succeed("http://127.0.0.1:8317")
          }))
        )),
        Effect.provide(FetchHttpClient.layer),
        Effect.provide(IdGenerator.layer),
        Effect.provide(ThreadHistory.layerTransient),
      )
    )
    console.log("Final result:", result.output)
  } catch (e) {
    console.log("Error:", e)
  }
}

test()
