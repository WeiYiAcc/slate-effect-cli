/**
 * commands/model/index.ts — Model slot management commands.
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
      case "slots": {
        const slotId = args[0];
        const url = slotId
          ? `${baseUrl}/model/slots/${slotId}`
          : `${baseUrl}/model/slots`;
        const res = await fetch(url);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "set-default": {
        const slotId = args[0];
        if (!slotId) { console.error("error: slot ID required"); process.exit(2); }
        const body: Record<string, string | undefined> = {};
        if (flags.model) body.model = flags.model as string;
        if (flags.variant) body.variant = flags.variant as string;
        if (flags["provider-id"]) body.providerId = flags["provider-id"] as string;
        const res = await fetch(`${baseUrl}/model/slots/${slotId}/default`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        console.log("Status:", res.status);
        return;
      }
      case "favorite": {
        const slotId = args[0];
        const modelId = args[1];
        if (!slotId || !modelId) {
          console.error("error: slot ID and model ID required");
          process.exit(2);
        }
        const res = await fetch(`${baseUrl}/model/slots/${slotId}/favorite`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ modelID: modelId }),
        });
        console.log("Status:", res.status);
        return;
      }
      case "sets": {
        const res = await fetch(`${baseUrl}/model/catalog/sets`);
        const text = await res.text();
        console.log(text);
        return;
      }
      case "apply-set": {
        const setId = args[0];
        if (!setId) { console.error("error: set ID required"); process.exit(2); }
        const res = await fetch(`${baseUrl}/model/sets/${setId}/apply-defaults`, { method: "POST" });
        console.log("Status:", res.status);
        return;
      }
      case "set-session": {
        const sessionId = args[0];
        if (!sessionId) { console.error("error: session ID required"); process.exit(2); }
        const body: Record<string, string | undefined> = {};
        if (flags.slot) body.slot = flags.slot as string;
        if (flags.model) body.model = flags.model as string;
        if (flags.variant) body.variant = flags.variant as string;
        if (flags["provider-id"]) body.providerId = flags["provider-id"] as string;
        const res = await fetch(`${baseUrl}/model/session/${sessionId}/model`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        console.log("Status:", res.status);
        return;
      }
      default: {
        if (subcommand) console.error(`error: unknown model subcommand: ${subcommand}`);
        console.error("Usage: slate-effect-cli model <slots|set-default|favorite|sets|apply-set|set-session>");
        process.exit(2);
      }
    }
  } catch (err) {
    console.error("error:", (err as Error).message);
    process.exit(1);
  }
}
