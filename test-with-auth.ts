
import { Effect, Schema, Layer, Redacted } from "effect"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { BunRuntime } from "@effect/platform-bun"
import { FetchHttpClient } from "effect/unstable/http"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"

const API_KEY = "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"

const program = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  
  // Add auth header
  const request = HttpClientRequest.post("https://openrouter.ai/api/v1/responses", {
    body: {
      model: "minimax/minimax-m3:free",
      input: "Say hi in one word",
      stream: false
    }
  }).pipe(HttpClientRequest.setHeader("Authorization", "Bearer " + API_KEY))
  
  const response = yield* client.execute(request)
  const data = yield* response.json
  console.log("Extracted text:", data.output?.[0]?.content?.[0]?.text)
})

const runnable = program.pipe(
  Effect.provide(FetchHttpClient.layer),
)

BunRuntime.runMain(runnable)
