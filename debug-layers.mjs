
import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { IdGenerator } from "@effect-agent/core"
import { ThreadHistory } from "@effect-agent/engine"
import { OpenAiClient } from "@effect/ai-openai"
import { OpenAiLanguageModel } from "@effect/ai-openai"
import {
  EffectToolkitLayer,
} from "./src/tools/effect-tools"

console.log("=== Layer Debug ===")
console.log("FetchHttpClient.layer:", FetchHttpClient.layer ? typeof FetchHttpClient.layer : "null/undefined")
console.log("FetchHttpClient.layer has build?", FetchHttpClient.layer && typeof FetchHttpClient.layer.build === "function")

console.log("\nIdGenerator.layer:", IdGenerator.layer ? typeof IdGenerator.layer : "null/undefined")
console.log("IdGenerator.layer has build?", IdGenerator.layer && typeof IdGenerator.layer.build === "function")

console.log("\nThreadHistory.layerTransient:", ThreadHistory.layerTransient ? typeof ThreadHistory.layerTransient : "null/undefined")
console.log("ThreadHistory.layerTransient has build?", ThreadHistory.layerTransient && typeof ThreadHistory.layerTransient.build === "function")

console.log("\nOpenAiClient.layer: (will test below)")
console.log("OpenAiLanguageModel.model: (will test below)")
console.log("EffectToolkitLayer:", EffectToolkitLayer ? typeof EffectToolkitLayer : "null/undefined")
console.log("EffectToolkitLayer has build?", EffectToolkitLayer && typeof EffectToolkitLayer.build === "function")

// Test OpenAiClient.layer
try {
  const apiKey = { _tag: "Redacted", _value: "test" }
  const OpenAiLayer = OpenAiClient.layer({ apiKey, apiUrl: "http://test" })
  console.log("\nOpenAiClient.layer:", typeof OpenAiLayer)
  console.log("OpenAiClient.layer has build?", typeof OpenAiLayer.build === "function")
} catch (e) {
  console.log("\nOpenAiClient.layer error:", e.message)
}

// Test OpenAiLanguageModel.model
try {
  const OpenAiLanguageModelLayer = OpenAiLanguageModel.model({ model: "test" })
  console.log("\nOpenAiLanguageModelLayer:", typeof OpenAiLanguageModelLayer)
  console.log("OpenAiLanguageModelLayer has build?", typeof OpenAiLanguageModelLayer.build === "function")
} catch (e) {
  console.log("\nOpenAiLanguageModelLayer error:", e.message)
}
