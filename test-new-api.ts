
import { Effect, Schema, Redacted, Layer } from "effect"
import { Agent, AgentRuntime } from "effect-agent"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { FetchHttpClient } from "effect/unstable/http"

console.log("=== Testing Effect Agent with matching versions ===")

// Test schema - use explicit class names
const UserMessage = Schema.Class("UserMessage")({
  content: Schema.String,
})

const AiResponse = Schema.Class("AiResponse")({
  response: Schema.String,
})

console.log("Schema: OK")

// Test agent definition
const SecAgent = Agent.define("sec", {
  input: UserMessage,
  output: AiResponse,
  instructions: ({ content }) => Effect.succeed("Reply: " + content),
  toolkit: { tools: [] },
  policy: {
    maxTurns: 2,
    maxToolCalls: 3,
    maxDuration: "30 seconds",
    toolConcurrency: 1,
  },
})

console.log("Agent: OK")

// Test layers
const apiKey = Redacted.make("ak-local-cpa")
const baseUrl = "http://127.0.0.1:8317"

const OpenAiLayer = OpenAiClient.layer({ apiKey, apiUrl: baseUrl })
const OpenAiLanguageModelLayer = OpenAiLanguageModel.model({ model: "openrouter/openrouter/free" })
const FetchHttpClientLayer = FetchHttpClient.layer

console.log("Layers: OK")

// Test layer composition
const TestLayer = Layer.mergeAll(
  FetchHttpClientLayer,
  OpenAiLanguageModelLayer,
  OpenAiLayer,
)

console.log("Layer merge: OK")

// Run test
async function test() {
  try {
    console.log("Running agent...")
    const result = await Effect.runPromise(
      AgentRuntime.run(SecAgent, { input: new UserMessage({ content: "hello" }) })
        .pipe(Effect.provide(TestLayer))
    )
    console.log("SUCCESS:", result.output.response)
  } catch (e) {
    console.log("ERROR:", e.message || String(e))
  }
}

test()
