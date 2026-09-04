
import { Effect, Layer } from "effect"
import { OpenAiClient } from "@effect/ai-openai"
import { OpenAiLanguageModel } from "@effect/ai-openai"

const apiKey = { _tag: "Redacted", _value: "ak-local-cpa" }
const OpenAiLayer = OpenAiClient.layer({ apiKey, apiUrl: "http://127.0.0.1:8317" })
const OpenAiLanguageModelLayer = OpenAiLanguageModel.model({ model: "openrouter/openrouter/free" })

const SecRuntimeLayer = Layer.mergeAll(
  OpenAiLayer,
  OpenAiLanguageModelLayer,
)

console.log("SecRuntimeLayer:", typeof SecRuntimeLayer)
console.log("SecRuntimeLayer has build?", typeof SecRuntimeLayer.build === "function")
console.log("SecRuntimeLayer.build:", SecRuntimeLayer.build)

// Try to build the layer
try {
  const built = SecRuntimeLayer.build
  console.log("Built layer:", typeof built)
} catch (e) {
  console.log("Build error:", e.message)
}
