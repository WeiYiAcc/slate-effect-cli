/**
 * commands/workflow/index.ts — Workflow run management commands.
 */
import { Effect } from "effect";
import { healthCheck } from "../../runtime/slate-service.ts";

async function findBaseUrl(): Promise<string> {
  for (let p = 18900; p <= 18999; p++) {
    const url = `http://127.0.0.1:${p}`;
    if (await Effect.runPromise(healthCheck(url))) {
      return url;
    }
  }
  throw new Error("no slate server found");
}

export async function run(
  subcommand: string | undefined,
  args: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  try {
    const baseUrl = await findBaseUrl();
    
    switch (subcommand) {
      case "list": {
        const sessionId = flags.session ?? flags["session-id"];
        if (!sessionId) { console.error("error: --session required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/workflow-run?sessionID=${sessionId}`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "get": {
        const runId = args[0];
        if (!runId) { console.error("error: run ID required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/workflow-run/${runId}`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "cancel": {
        const runId = args[0];
        if (!runId) { console.error("error: run ID required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/workflow-run/${runId}/cancel`, { method: "POST" });
        console.log("Status:", res.status);
        return;
      }
      case "graph": {
        const runId = args[0];
        if (!runId) { console.error("error: run ID required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/workflow-run/${runId}/program-graph`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "backfill": {
        const sessionId = flags.session ?? flags["session-id"];
        if (!sessionId) { console.error("error: --session required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/workflow-run/agent-turn-data/backfill`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionID: sessionId }),
        });
        console.log("Status:", res.status);
        return;
      }
      default: {
        if (subcommand) console.error(`error: unknown workflow subcommand: ${subcommand}`);
        console.error("Usage: slate-effect-cli workflow <list|get|cancel|graph|backfill>");
        process.exit(2);
      }
    }
  } catch (err) {
    console.error("error:", (err as Error).message);
    process.exit(1);
  }
}
