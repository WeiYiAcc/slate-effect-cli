/**
 * commands/events/index.ts — Event streaming commands.
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
      case "watch": {
        const endpoint = flags.global ? "/global/event" : "/event";
        const url = new URL(`${baseUrl}${endpoint}`);
        if (flags.types) url.searchParams.set("types", String(flags.types));
        if (flags.global) url.searchParams.set("global", "true");
        
        const res = await fetch(url.toString(), { headers: { accept: "text/event-stream" } });
        if (!res.ok || !res.body) {
          console.error(`error: SSE connect failed: HTTP ${res.status}`);
          process.exit(2);
        }
        
        console.error(`info: watching SSE ${endpoint} - Ctrl+C to stop`);
        
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).replace(/\r$/, "");
            buf = buf.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const ev = JSON.parse(payload);
              console.log(JSON.stringify(ev, null, 2));
            } catch {
              console.log(payload);
            }
          }
        }
        return;
      }
      default: {
        if (subcommand) console.error(`error: unknown events subcommand: ${subcommand}`);
        console.error("Usage: slate-effect-cli events <watch>");
        process.exit(2);
      }
    }
  } catch (err) {
    console.error("error:", (err as Error).message);
    process.exit(1);
  }
}
