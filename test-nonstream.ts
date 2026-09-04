
import { Effect, Schema, Layer, Redacted } from "effect"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { BunRuntime } from "@effect/platform-bun"
import { FetchHttpClient } from "effect/unstable/http"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"

const program = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  
  // Make non-streaming request
  const request = HttpClientRequest.post("https://openrouter.ai/api/v1/responses", {
    body: {
      model: "minimax/minimax-m3:free",
      input: "Say hi in one word",
      stream: false
    }
  })
  
  const response = yield* client.execute(request)
  const data = yield* response.json
  console.log("Raw response:", JSON.stringify(data).slice(0, 500))
  
  // Extract text from response
  const output = data.output?.[0]?.content?.[0]?.text
  console.log("Extracted text:", output)
})

const runnable = program.pipe(
  Effect.provide(FetchHttpClient.layer),
)

BunRuntime.runMain(runnable)
