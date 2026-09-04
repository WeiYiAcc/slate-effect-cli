
import { Effect } from "effect"
import { OpenAiClient } from "@effect/ai-openai"
import { OpenAiLanguageModel } from "@effect/ai-openai"
import { FetchHttpClient } from "effect/unstable/http"
import { IdGenerator as IdGenNs } from "@effect-agent/core"
import { ThreadHistory as THNs } from "@effect-agent/engine"
import { EffectToolkitLayer } from "./src/tools/effect-tools"

// Test each layer
console.log("=== Testing Layers ===")

// FetchHttpClient
try {
  const fhl = FetchHttpClient.layer
  console.log("FetchHttpClient.layer:", typeof fhl)
  console.log("Has build?", typeof fhl.build === "function")
} catch (e) { console.log("FetchHttpClient error:", e.message) }

// IdGenerator
try {
  const igl = IdGenNs.IdGenerator.layer
  console.log("IdGenerator.layer:", typeof igl)
  console.log("Has build?", typeof igl.build === "function")
} catch (e) { console.log("IdGenerator error:", e.message) }

// ThreadHistory
try {
  const thl = THNs.ThreadHistory.layerTransient
  console.log("ThreadHistory.layerTransient:", typeof thl)
  console.log("Has build?", typeof thl.build === "function")
} catch (e) { console.log("ThreadHistory error:", e.message) }

// OpenAiClient
try {
  const apiKey = { _tag: "Redacted", _value: "ak-local-cpa" }
  const odl = OpenAiClient.layer({ apiKey, apiUrl: "http://127.0.0.1:8317" })
  console.log("OpenAiClient.layer:", typeof odl)
  console.log("Has build?", typeof odl.build === "function")
} catch (e) { console.log("OpenAiClient error:", e.message) }

// OpenAiLanguageModel
try {
  const oll = OpenAiLanguageModel.model({ model: "openrouter/openrouter/free" })
  console.log("OpenAiLanguageModel.layer:", typeof oll)
  console.log("Has build?", typeof oll.build === "function")
} catch (e) { console.log("OpenAiLanguageModel error:", e.message) }

// EffectToolkitLayer
try {
  const etl = EffectToolkitLayer
  console.log("EffectToolkitLayer:", typeof etl)
  console.log("Has build?", typeof etl.build === "function")
} catch (e) { console.log("EffectToolkitLayer error:", e.message) }
