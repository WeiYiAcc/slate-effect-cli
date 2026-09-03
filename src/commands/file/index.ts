/**
 * commands/file/index.ts — File operations commands.
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
      case "ls": {
        const path = args[0] || "";
        const res = await fetch(`${baseUrl}/file?path=${encodeURIComponent(path)}`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "cat": {
        const path = args[0];
        if (!path) { console.error("error: file path required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/file/content?path=${encodeURIComponent(path)}`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "status": {
        const res = await fetch(`${baseUrl}/file/status`);
        const text = await res.text();
        console.log(text);
        return;
      }
      default: {
        if (subcommand) console.error(`error: unknown file subcommand: ${subcommand}`);
        console.error("Usage: slate-effect-cli file <ls|cat|status>");
        process.exit(2);
      }
    }
  } catch (err) {
    console.error("error:", (err as Error).message);
    process.exit(1);
  }
}
