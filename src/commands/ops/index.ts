/**
 * commands/ops/index.ts — Operations/server commands.
 */
import { Effect } from "effect";
import { healthCheck, getConfig, patchConfig, disposeServer, getVcs, getServerPath } from "../../runtime/slate-service.ts";

async function findBaseUrl(): Promise<string> {
  for (let p = 18900; p <= 18999; p++) {
    const url = `http://127.0.0.1:${p}`;
    if (await Effect.runPromise(healthCheck(url))) {
      return url;
    }
  }
  throw new Error("no slate server found in 18900..18999");
}

export async function run(
  subcommand: string | undefined,
  args: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  try {
    const baseUrl = await findBaseUrl();
    const svc = { baseUrl, dir: process.cwd() };
    
    switch (subcommand) {
      case "health": {
        const healthy = await Effect.runPromise(healthCheck(baseUrl));
        const res = await fetch(`${baseUrl}/global/health`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "dispose": {
        const res = await fetch(`${baseUrl}/global/dispose`, { method: "POST" });
        console.log("Status:", res.status);
        return;
      }
      case "storage-reset": {
        const res = await fetch(`${baseUrl}/global/storage/reset`, { method: "POST" });
        console.log("Status:", res.status);
        return;
      }
      case "instance-dispose": {
        const res = await fetch(`${baseUrl}/instance/dispose`, { method: "POST" });
        console.log("Status:", res.status);
        return;
      }
      case "path": {
        const res = await fetch(`${baseUrl}/path`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "vcs": {
        const res = await fetch(`${baseUrl}/vcs`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "log": {
        const service = args[0] || "cli";
        const level = args[1] || "info";
        const message = args.slice(2).join(" ");
        let extra: unknown = undefined;
        if (flags.extra) {
          try {
            extra = JSON.parse(String(flags.extra));
          } catch {
            console.error("error: --extra must be valid JSON");
            process.exit(2);
          }
        }
        
        const res = await fetch(`${baseUrl}/log`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ service, level, message, extra }),
        });
        console.log("Status:", res.status);
        return;
      }
      case "config": {
        if (flags.data) {
          let data: unknown;
          try {
            data = JSON.parse(String(flags.data));
          } catch {
            console.error("error: --data must be valid JSON");
            process.exit(2);
          }
          
          const res = await fetch(`${baseUrl}/global/config`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(data),
          });
          const text = await res.text();
          console.log(text);
        } else {
          const res = await fetch(`${baseUrl}/global/config`);
          const text = await res.text();
          console.log(text);
        }
        return;
      }
      default: {
        if (subcommand) console.error(`error: unknown ops subcommand: ${subcommand}`);
        console.error("Usage: slate-effect-cli ops <health|dispose|storage-reset|path|vcs|log|config>");
        process.exit(2);
      }
    }
  } catch (err) {
    console.error("error:", (err as Error).message);
    process.exit(1);
  }
}
