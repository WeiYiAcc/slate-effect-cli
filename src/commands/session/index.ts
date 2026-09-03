/**
 * commands/session/index.ts — Session management commands.
 */
import { Effect } from "effect";
import { healthCheck, listSessions, createSession, getSession, deleteSession, abortSession, getSessionMessages, sendCommand } from "../../runtime/slate-service.ts";

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
    const svc = { baseUrl, dir: process.cwd() };
    
    switch (subcommand) {
      case "list": {
        const params = new URLSearchParams();
        if (flags.roots) params.set("roots", "true");
        if (flags.limit) params.set("limit", String(flags.limit));
        const qs = params.toString();
        const res = await fetch(`${baseUrl}/session${qs ? `?${qs}` : ""}`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "create": {
        const body: Record<string, unknown> = {};
        if (args.length > 0) body.title = args.join(" ");
        if (flags["parent-id"]) body.parentID = flags["parent-id"];
        if (flags["root-session-id"]) body.rootSessionID = flags["root-session-id"];
        
        const res = await fetch(`${baseUrl}/session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        console.log(text);
        return;
      }
      case "get": {
        const sessionId = args[0];
        if (!sessionId) { console.error("error: session ID required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/session/${sessionId}`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "rm": {
        const sessionId = args[0];
        if (!sessionId) { console.error("error: session ID required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/session/${sessionId}`, { method: "DELETE" });
        console.log("Status:", res.status);
        return;
      }
      case "abort": {
        const sessionId = args[0];
        if (!sessionId) { console.error("error: session ID required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/session/${sessionId}/abort`, { method: "POST" });
        console.log("Status:", res.status);
        return;
      }
      case "messages": {
        const sessionId = args[0];
        if (!sessionId) { console.error("error: session ID required"); process.exit(2); }
        const params = new URLSearchParams();
        if (flags.limit) params.set("limit", String(flags.limit));
        const res = await fetch(`${baseUrl}/session/${sessionId}/message?${params}`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "command": {
        const sessionId = args[0];
        const cmd = args[1] || "";
        const cmdArgs = args.slice(2).join(" ");
        if (!sessionId || !cmd) { console.error("error: session ID and command required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/session/${sessionId}/command`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: cmd, arguments: cmdArgs }),
        });
        const text = await res.text();
        console.log(text);
        return;
      }
      default: {
        console.error(`error: unknown session subcommand: ${subcommand}`);
        console.error("Usage: slate-effect-cli session <list|create|get|rm|abort|messages|command>");
        process.exit(2);
      }
    }
  } catch (err) {
    console.error("error:", (err as Error).message);
    process.exit(1);
  }
}
