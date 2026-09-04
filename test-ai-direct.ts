
import { Effect, Schema } from "effect"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { BunRuntime } from "@effect/platform-bun"
import { FetchHttpClient } from "effect/unstable/http"
import { Redacted } from "effect"

const program = Effect.gen(function* () {
  const model = yield* OpenAiLanguageModel.LanguageModel
  
  // Simple prompt
  const response = yield* model.prompt({
    prompt: "Say hello in 1 word",
    schema: Schema.String,
  })
  
  console.log("Response:", response)
})

const runnable = program.pipe(
  Effect.provide(OpenAiLanguageModel.model("minimax/minimax-m3:free")),
  Effect.provide(OpenAiClient.layer({
    apiKey: Redacted.make("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"),
    apiUrl: "https://openrouter.ai/api/v1"
  })),
  Effect.provide(FetchHttpClient.layer),
)

BunRuntime.runMain(runnable)
