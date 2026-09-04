
import { Effect, Schema, Redacted, Layer } from "effect"
import { Agent, AgentRuntime, ThreadHistory, IdGenerator } from "effect-agent"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { FetchHttpClient } from "effect/unstable/http"

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
  policy: { maxTurns: 2, maxToolCalls: 3, maxDuration: "30 seconds", toolConcurrency: 1 },
})

const apiKey = Redacted.make("ak-local-cpa")
const baseUrl = "http://127.0.0.1:8317"

async function test() {
  try {
    const result = await Effect.runPromise(
      AgentRuntime.run(SecAgent, { input: new UserMessage({ content: "hello" }) })
        .pipe(Effect.provide(FetchHttpClient.layer))
        .pipe(Effect.provide(IdGenerator.layer))
        .pipe(Effect.provide(ThreadHistory.layerTransient))
        .pipe(Effect.provide(OpenAiLanguageModel.model({ model: "openrouter/openrouter/free" })))
        .pipe(Effect.provide(OpenAiClient.layer({ apiKey, apiUrl: baseUrl })))
    )
    console.log("Result:", result.output.response)
  } catch (e) {
    console.log("Error:", e)
  }
}

test()
