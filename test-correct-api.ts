
import { Effect, Schema, Redacted, Layer } from "effect"
import { Agent, AgentRuntime } from "effect-agent"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { FetchHttpClient } from "effect/unstable/http"

console.log("=== Testing Effect Agent 0.1.0-beta.47 with matching versions ===")

const UserMessage = Schema.Class("UserMessage")({
  content: Schema.String,
})

const AiResponse = Schema.Class("AiResponse")({
  response: Schema.String,
})

// Use Agent.make (not Agent.define)
const SecAgent = Agent.make("sec", {
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

console.log("Agent created: OK")

const apiKey = Redacted.make("ak-local-cpa")
const baseUrl = "http://127.0.0.1:8317"

async function test() {
  try {
    const result = await Effect.runPromise(
      AgentRuntime.run(SecAgent, { input: new UserMessage({ content: "hello" }) })
        .pipe(Effect.provide(FetchHttpClient.layer))
        .pipe(Effect.provide(OpenAiLanguageModel.model({ model: "openrouter/openrouter/free" })))
        .pipe(Effect.provide(OpenAiClient.layer({ apiKey, apiUrl: baseUrl })))
    )
    console.log("SUCCESS:", result.output.response)
  } catch (e) {
    console.log("ERROR:", e.message || String(e))
  }
}

test()
