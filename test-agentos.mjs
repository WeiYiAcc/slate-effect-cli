
import { createAgentOS } from "@rivet-dev/agentos";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./node_modules/@rivet-dev/agentos/package.json", "utf-8"));
console.log("AgentOS version:", pkg.version);

try {
  const aos = await createAgentOS();
  console.log("AgentOS created:", !!aos);
  if (aos && aos.dispose) {
    await aos.dispose();
  }
  process.exit(0);
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
}
