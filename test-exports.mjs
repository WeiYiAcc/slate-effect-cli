
import * as EA from "effect-agent"
console.log("effect-agent exports:")
console.log("ThreadHistory:", typeof EA.ThreadHistory)
console.log("IdGenerator:", typeof EA.IdGenerator)
console.log("ThreadHistory.layerTransient:", EA.ThreadHistory?.layerTransient)
console.log("IdGenerator.layer:", EA.IdGenerator?.layer)
