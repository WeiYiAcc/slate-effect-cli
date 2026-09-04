
import { Effect, Schema, Redacted } from "effect"
import { Agent, AgentRuntime } from "effect-agent"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"

class UserMessage extends Schema.Class(UserMessage)({
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

async function test() {
  try {
    const result = await Effect.runPromise(
      AgentRuntime.run(SecAgent, { input: new UserMessage({ content: "hello" }) })
    )
    console.log("Success:", result.output.response)
  } catch (e) {
    console.log("Error:", e.message)
  }
}

test()
