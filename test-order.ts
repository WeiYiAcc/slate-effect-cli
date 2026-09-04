
import { Effect, Layer } from "effect"
import { OpenAiClient } from "@effect/ai-openai"
import { OpenAiLanguageModel } from "@effect/ai-openai"
import { FetchHttpClient } from "effect/unstable/http"
import { IdGenerator as IdGenNs } from "@effect-agent/core"
import { ThreadHistory as THNs } from "@effect-agent/engine"
import { Agent, AgentRuntime } from "effect-agent"
import { EffectToolkit, EffectToolkitLayer } from "./src/tools/effect-tools"
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
  toolkit: EffectToolkit,
  policy: { maxTurns: 1, maxToolCalls: 1, maxDuration: "10 seconds", toolConcurrency: 1 },
})

// Build each layer step by step
console.log("Building layers...")

const apiKey = { _tag: "Redacted", _value: "ak-local-cpa" }
const OpenAiLayer = OpenAiClient.layer({ apiKey, apiUrl: "http://127.0.0.1:8317" })
console.log("1. OpenAiLayer built")

const OpenAiLanguageModelLayer = OpenAiLanguageModel.model({ model: "openrouter/openrouter/free" })
console.log("2. OpenAiLanguageModelLayer built")

const FetchHttpClientLayer = FetchHttpClient.layer
console.log("3. FetchHttpClientLayer built")

const ThreadHistoryLayer = THNs.ThreadHistory.layerTransient
console.log("4. ThreadHistoryLayer built")

const IdGeneratorLayer = IdGenNs.IdGenerator.layer
console.log("5. IdGeneratorLayer built")

// Check the toolkit layer in detail
console.log("\n6. EffectToolkitLayer type:", typeof EffectToolkitLayer)
console.log("EffectToolkitLayer keys:", Object.keys(EffectToolkitLayer))

// Try providing layers one at a time
async function testStep() {
  console.log("\n=== Step test ===")
  // First just try with OpenAiLayer
  try {
    const result = await Effect.runPromise(
      AgentRuntime.run(SecAgent, { input: new UserMessage({ content: "hello" }) })
        .pipe(Effect.provide(OpenAiLayer)),
    )
    console.log("Just OpenAiClient:", result)
  } catch (e) {
    console.log("Just OpenAiClient error:", e.message)
  }
  
  // Add OpenAiLanguageModelLayer
  try {
    const result = await Effect.runPromise(
      AgentRuntime.run(SecAgent, { input: new UserMessage({ content: "hello" }) })
        .pipe(Effect.provide(Layer.mergeAll(OpenAiLayer, OpenAiLanguageModelLayer))),
    )
    console.log("+ LanguageModel:", result)
  } catch (e) {
    console.log("+ LanguageModel error:", e.message)
  }
  
  // Add all other layers
  try {
    const result = await Effect.runPromise(
      AgentRuntime.run(SecAgent, { input: new UserMessage({ content: "hello" }) })
        .pipe(Effect.provide(Layer.mergeAll(OpenAiLayer, OpenAiLanguageModelLayer, FetchHttpClientLayer, ThreadHistoryLayer, IdGeneratorLayer, EffectToolkitLayer))),
    )
    console.log("All layers:", result)
  } catch (e) {
    console.log("All layers error:", e.message)
  }
}

testStep()
