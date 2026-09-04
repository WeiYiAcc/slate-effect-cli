
// This will fail because effect-agent 0.0.1-beta.3 requires effect 4.0.0-beta.102
// but we're using effect 3.22.1 which is incompatible
import { Effect, Schema, Redacted, Layer } from "effect"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { FetchHttpClient } from "effect/unstable/http"

const apiKey = { _tag: "Redacted", _value: "ak-local-cpa" }
const baseUrl = "http://127.0.0.1:8317"

const layer = Layer.mergeAll(
  FetchHttpClient.layer,
  OpenAiClient.layer({ apiKey, apiUrl: baseUrl })
)

async function test() {
  const result = await Effect.runPromise(
    AgentRuntime.run(Agent.make({
      input: new UserMessage({ content: "test" }),
      output: new AiResponse({ response: "test" })
    }), { input: new UserMessage({ content: "test" }) })
    .pipe(Effect.provide(layer))
  )
  console.log("Success:", result.output.response)
}

test()
