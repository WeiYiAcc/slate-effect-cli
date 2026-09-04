
import { AgentPolicy } from "effect-agent"
console.log("AgentPolicy:", typeof AgentPolicy)
console.log("AgentPolicy keys:", Object.keys(AgentPolicy))

// Try the nested AgentPolicy
if (AgentPolicy.AgentPolicy) {
  console.log("AgentPolicy.AgentPolicy:", typeof AgentPolicy.AgentPolicy)
  const Policy = AgentPolicy.AgentPolicy
  console.log("Policy.make:", typeof Policy.make)
  if (Policy.make) {
    try {
      const result = Policy.make({maxTurns: 2, maxToolCalls: 1, maxDuration: "30 seconds", toolConcurrency: 1})
      console.log("make result:", result)
    } catch (e) {
      console.log("make error:", e)
    }
  }
}
