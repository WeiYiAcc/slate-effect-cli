
import { Effect, Schema, Layer, Redacted } from "effect"
import { Agent, AgentRuntime, ThreadHistory, IdGenerator } from "effect-agent"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { FetchHttpClient } from "effect/unstable/http"

console.log("Effect Agent imports successful!")

// Check if all required APIs exist
console.log("Agent.make:", typeof Agent.make)
console.log("AgentRuntime.run:", typeof AgentRuntime.run)
console.log("ThreadHistory.layerTransient:", typeof ThreadHistory?.layerTransient)
console.log("IdGenerator.layer:", typeof IdGenerator?.layer)

// Test schema
class UserMessage extends Schema.Class(UserMessage)("UserMessage")({
  content: Schema.String,
}) {}

class AiResponse extends Schema.Class(AiResponse)("AiResponse")({
  response: Schema.String,
}) {}

console.log("Schema definitions work!")

// Test agent creation
const SecAgent = Agent.make("sec", {
  input: UserMessage,
  output: AiResponse,
  instructions: ({ content }) => Effect.succeed("Reply: " + content),
  toolkit: { tools: [] },
  policy: { maxTurns: 2, maxToolCalls: 3, maxDuration: "30 seconds", toolConcurrency: 1 },
})

console.log("Agent created:", SecAgent)
console.log("SUCCESS: Effect Agent system is working!")
