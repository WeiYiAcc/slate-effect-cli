
// Try different import patterns
import { IdGenerator as IdGen1 } from "@effect-agent/core"
import { ThreadHistory as TH1 } from "@effect-agent/engine"

console.log("IdGenerator from core:", IdGen1)
console.log("ThreadHistory from engine:", TH1)

// Check if we can access static properties
console.log("IdGenerator.layer:", IdGen1?.layer)
console.log("ThreadHistory.layerTransient:", TH1?.layerTransient)
