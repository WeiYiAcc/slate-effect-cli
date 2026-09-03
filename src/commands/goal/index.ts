/**
 * commands/goal/index.ts — The goal command implementation using CLIProxyAPI Free Models Router.
 */
import { Effect } from "effect";
import { healthCheck } from "../../runtime/slate-service.ts";
import { selectFreeModel, chatCompletion, getFreeModelsConfig } from "../../providers/cliproxyapi.ts";

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
    // Combine subcommand and args into the objective
    // so that "goal Create test" works the same as "goal 'Create test'"
    const objective = subcommand ? [subcommand, ...args].filter(Boolean).join(" ").trim() : args.join(" ").trim();
    
    if (!objective) {
      console.error("error: goal requires an objective");
      process.exit(2);
    }
    
    // Check if we should use Free Models Router
    const useFreeModels = flags.free !== false && flags.provider !== "openrouter";
    
    if (useFreeModels) {
      // Use CLIProxyAPI Free Models Router directly
      await runGoalWithFreeModels(objective, flags);
      return;
    }
    
    // Fallback to slate server
    const baseUrl = await findBaseUrl();
    const wait = flags.wait === false ? false : true;
    const timeout = flags.timeout ? Number(flags.timeout) : 3600;
    
    // Create session
    const sessionRes = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: objective.slice(0, 50) }),
    });
    const session = await sessionRes.json() as { id: string };
    const sessionId = session.id;
    
    // Send goal command
    await fetch(`${baseUrl}/session/${sessionId}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "goal", arguments: objective }),
    });
    
    if (!wait) {
      console.log(JSON.stringify({ sessionId, status: "running" }, null, 2));
      return;
    }
    
    // Wait for completion
    const timeoutMs = timeout * 1000;
    const deadline = Date.now() + timeoutMs;
    const POLL_MS = 15000;
    
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_MS));
      
      // Poll workflow runs
      const runsRes = await fetch(`${baseUrl}/workflow-run?sessionID=${sessionId}`);
      const runs = await runsRes.json() as Array<{ id: string; status: string }>;
      
      // Get messages
      const msgsRes = await fetch(`${baseUrl}/session/${sessionId}/message`);
      const messages = await msgsRes.json() as Array<{
        role?: string;
        content?: Array<{ type?: string; text?: string }>;
        timestamp?: number;
      }>;
      
      let allText = "";
      for (const m of messages) {
        if (m.role === "assistant" && m.content) {
          for (const c of m.content) {
            if (c?.type === "text" && c.text) allText += c.text + "\n";
          }
        }
      }
      
      // Check completion
      if (/goal satisfied/i.test(allText)) {
        console.log(JSON.stringify({
          sessionId,
          status: "completed",
          runs: runs.map(r => ({ id: r.id, status: r.status })),
          finalMessage: extractAssistantText(messages),
        }, null, 2));
        return;
      }
      
      // Check terminal + quiet
      const terminal = new Set(["completed", "failed", "cancelled"]);
      if (runs.length > 0 && runs.every(r => terminal.has(r.status))) {
        console.log(JSON.stringify({
          sessionId,
          status: "completed-quiet",
          runs: runs.map(r => ({ id: r.id, status: r.status })),
        }, null, 2));
        return;
      }
    }
    
    console.log(JSON.stringify({ sessionId, status: "timeout" }, null, 2));
  } catch (err) {
    console.error("error:", err);
    console.error("error type:", typeof err);
    if (err instanceof Error) {
      console.error("error message:", err.message);
      console.error("error stack:", err.stack);
    } else {
      console.error("error is not an Error instance");
    }
    process.exit(1);
  }
}

async function runGoalWithFreeModels(objective: string, flags: Record<string, string | boolean>): Promise<void> {
  console.log(`Using CLIProxyAPI Free Models Router for: ${objective}`);
  
  try {
    // Select a free model
    const selection = await Effect.runPromise(selectFreeModel);
    console.log(`Selected model: ${selection.modelId} (provider: ${selection.providerName})`);
    
    // Get the full config
    const config = getFreeModelsConfig();
    
    // Send chat completion request
    const messages = [
      { role: "system", content: "You are a helpful assistant. Complete the user's objective step by step." },
      { role: "user", content: objective }
    ];
    
    console.log("DEBUG: About to call chatCompletion");
    
    let response;
    try {
      response = await Effect.runPromise(
        chatCompletion(config, selection.modelId, messages, {
          temperature: 0.7,
          maxTokens: 8192
        })
      );
    } catch (e) {
              throw e;
    }
    
    process.stdout.write("Response:\n");
    process.stdout.write(""); // flush
    process.stdout.write(response + "\n");
    
  } catch (err) {
    console.error("error:", err);
    console.error("error type:", typeof err);
    if (err instanceof Error) {
      console.error("error message:", err.message);
      console.error("error stack:", err.stack);
    } else {
      console.error("error is not an Error instance");
    }
    process.exit(1);
  }
}

function extractAssistantText(messages: Array<{
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
}>): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.content) continue;
    const texts = m.content.filter(c => c?.type === "text" && c.text).map(c => c.text!);
    if (texts.length) return texts.join("\n\n");
  }
  return undefined;
}
