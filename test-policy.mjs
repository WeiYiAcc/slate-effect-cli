
import { AgentPolicy } from "effect-agent"
const ap = AgentPolicy
console.log("ap type:", typeof ap)
console.log("ap keys:", Object.keys(ap))
console.log("has make:", typeof ap.make)
if (ap.make) {
  const result = ap.make({maxTurns: 2, maxToolCalls: 1, maxDuration: "30 seconds", toolConcurrency: 1})
  console.log("make result:", result)
}
