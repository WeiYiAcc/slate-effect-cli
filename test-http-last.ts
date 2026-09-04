
import { Effect, Layer } from "effect"
import { OpenAiClient } from "@effect/ai-openai"
import { OpenAiLanguageModel } from "@effect/ai-openai"
import { FetchHttpClient } from "effect/unstable/http"
import { IdGenerator as IdGenNs } from "@effect-agent/core"
import { ThreadHistory as THNs } from "@effect-agent/engine"
import { Agent, AgentRuntime } from "effect-agent"
import { Schema } from "effect"

class UserMessage extends Schema.Class<UserMessage>("UserMessage")({
  content: Schema.String,
}) {}

class AiResponse extends Schema.Class<AiResponse>("AiResponse")({
  response: Schema.String,
}) {}

const SecAgent = Agent.make("sec", {
  input: UserMessage,
  output: AiResponse,
  instructions: ({ content }) => Effect.succeed("Reply: " + content),
  toolkit: { tools: [] },
  policy: { maxTurns: 1, maxToolCalls: 1, maxDuration: "10 seconds", toolConcurrency: 1 },
})

const apiKey = { _tag: "Redacted", _value: "ak-local-cpa" }

async function test() {
  try {
    // FetchHttpClient LAST
    const result = await Effect.runPromise(
      AgentRuntime.run(SecAgent, { input: new UserMessage({ content: "hello" }) })
        .pipe(Effect.provide(IdGenNs.IdGenerator.layer))
        .pipe(Effect.provide(THNs.ThreadHistory.layerTransient))
        .pipe(Effect.provide(OpenAiLanguageModel.model({ model: "openrouter/openrouter/free" })))
        .pipe(Effect.provide(OpenAiClient.layer({ apiKey, apiUrl: "http://127.0.0.1:8317" })))
        .pipe(Effect.provide(FetchHttpClient.layer))
    )
    console.log("Result:", result.output.response)
  } catch (e) {
    console.log("Error:", e)
  }
}

test()
