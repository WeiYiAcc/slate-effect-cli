/**
 * commands/find/index.ts — Find/search commands.
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
      case "text": {
        const pattern = args[0];
        if (!pattern) { console.error("error: pattern required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/find?pattern=${encodeURIComponent(pattern)}`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "files": {
        const query = args[0];
        if (!query) { console.error("error: query required"); process.exit(2); }
        const params = new URLSearchParams();
        params.set("query", query);
        if (flags.dirs) params.set("dirs", String(flags.dirs));
        if (flags.type) params.set("type", String(flags.type));
        if (flags.limit) params.set("limit", String(flags.limit));
        const res = await fetch(`${baseUrl}/find/file?${params}`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "symbols": {
        const query = args[0];
        if (!query) { console.error("error: query required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/find/symbol?query=${encodeURIComponent(query)}`);
        const text = await res.text();
        console.log(text);
        return;
      }
      default: {
        if (subcommand) console.error(`error: unknown find subcommand: ${subcommand}`);
        console.error("Usage: slate-effect-cli find <text|files|symbols>");
        process.exit(2);
      }
    }
  } catch (err) {
    console.error("error:", (err as Error).message);
    process.exit(1);
  }
}
