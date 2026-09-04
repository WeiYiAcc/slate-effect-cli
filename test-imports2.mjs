
import { IdGenerator as IdGen1 } from "@effect-agent/core"
import { ThreadHistory as TH1 } from "@effect-agent/engine"

console.log("IdGen1 keys:", Object.keys(IdGen1))
console.log("TH1 keys:", Object.keys(TH1))

// Try accessing .default
console.log("IdGen1.default:", IdGen1.default)
console.log("TH1.default:", TH1.default)

// Try accessing nested property
const IG = IdGen1.IdGenerator
const TH = TH1.ThreadHistory
console.log("IG:", IG)
console.log("TH:", TH)
console.log("IG.layer:", IG?.layer)
console.log("TH.layerTransient:", TH?.layerTransient)
