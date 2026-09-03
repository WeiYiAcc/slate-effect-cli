/**
 * commands/perm/index.ts — Permission management commands.
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
        const res = await fetch(`${baseUrl}/permission`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "reply": {
        const requestId = args[0];
        const action = args[1];
        if (!requestId || !action) {
          console.error("error: request ID and action required");
          process.exit(2);
        }
        if (!["once", "always", "reject"].includes(action)) {
          console.error("error: action must be once, always, or reject");
          process.exit(2);
        }
        const res = await fetch(`${baseUrl}/permission/${requestId}/reply`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reply: action, message: flags.message }),
        });
        console.log("Status:", res.status);
        return;
      }
      default: {
        if (subcommand) console.error(`error: unknown perm subcommand: ${subcommand}`);
        console.error("Usage: slate-effect-cli perm <list|reply>");
        process.exit(2);
      }
    }
  } catch (err) {
    console.error("error:", (err as Error).message);
    process.exit(1);
  }
}
