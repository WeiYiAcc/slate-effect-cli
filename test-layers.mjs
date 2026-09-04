
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { OpenAiClient } from "@effect/ai-openai"
import { Agent, AgentRuntime, ThreadHistory, IdGenerator } from "effect-agent"
import { Schema, Redacted } from "effect"
import {
  EffectToolkit,
  EffectToolkitLayer,
} from "./src/tools/effect-tools"

console.log("FetchHttpClient:", typeof FetchHttpClient)
console.log("FetchHttpClient.layer:", typeof FetchHttpClient.layer)
console.log("ThreadHistory:", typeof ThreadHistory)
console.log("ThreadHistory.layerTransient:", typeof ThreadHistory.layerTransient)
console.log("IdGenerator:", typeof IdGenerator)
console.log("IdGenerator.layer:", typeof IdGenerator.layer)
console.log("EffectToolkit:", typeof EffectToolkit)
console.log("EffectToolkitLayer:", typeof EffectToolkitLayer)

// Test building layers
console.log("\nBuilding layers...")
try {
  const THL = ThreadHistory.layerTransient
  console.log("ThreadHistoryLayer OK:", THL)
} catch (e) {
  console.log("ThreadHistoryLayer error:", e)
}

try {
  const IGL = IdGenerator.layer
  console.log("IdGeneratorLayer OK:", IGL)
} catch (e) {
  console.log("IdGeneratorLayer error:", e)
}

try {
  const FHL = FetchHttpClient.layer
  console.log("FetchHttpClientLayer OK:", FHL)
} catch (e) {
  console.log("FetchHttpClientLayer error:", e)
}

try {
  const ETL = EffectToolkitLayer
  console.log("EffectToolkitLayer OK:", ETL)
} catch (e) {
  console.log("EffectToolkitLayer error:", e)
}
