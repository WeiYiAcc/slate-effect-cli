import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Redacted, Schema } from "effect";
import { Agent, AgentRuntime } from "effect-agent";
import { AgentPolicy } from "effect-agent/AgentPolicy";
import { ThreadHistory } from "effect-agent/ThreadHistory";
import { IdGenerator } from "effect-agent/IdGenerator";
import { Toolkit } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";

// Agent with empty toolkit (tools will be added later)
const secAgent = Agent.make("sec", {
  input: Schema.String,
  output: Schema.Struct({
    response: Schema.String,
  }),
  instructions: 'Respond with JSON like {"response": "..."}',
  toolkit: Toolkit.empty,
  policy: AgentPolicy.make({
    maxTurns: 3,
    maxToolCalls: 5,
    maxDuration: "30 seconds",
    toolConcurrency: 1,
  }),
});

// Run agent
function runAgent(prompt: string) {
  return Effect.gen(function* () {
    const result = yield* AgentRuntime.run(secAgent, prompt);
    const out = result.output as { response: string };
    return out.response;
  }).pipe(
    Effect.provide(OpenAiLanguageModel.model("openrouter/free")),
    Effect.provide(OpenAiClient.layer({ 
      apiKey: Redacted.make("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"), 
      apiUrl: "https://openrouter.ai/api/v1" 
    })),
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(IdGenerator.layer),
    Effect.provide(ThreadHistory.layerTransient),
  );
}

// CLI
const SESSION_DIR = path.join(os.homedir(), ".local", "share", "sec", "sessions");

function ensureDir(d: string) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function loadSession(id: string) {
  const f = path.join(SESSION_DIR, id + ".json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf-8")) : null;
}
function saveSession(s: any) {
  ensureDir(SESSION_DIR);
  fs.writeFileSync(path.join(SESSION_DIR, s.id + ".json"), JSON.stringify(s));
}

const cmd = process.argv[2];
const args = process.argv.slice(3);

if (cmd === "run") {
  const prompt = args.join(" ");
  if (!prompt) { console.error("Usage: sec run <prompt>"); process.exit(1); }
  Effect.runPromise(runAgent(prompt)).then(r => console.log(r)).catch(e => { console.error("Error:", e.message); process.exit(1); });
} else if (cmd === "chat") {
  let sessionId = args.indexOf("--session") >= 0 ? args[args.indexOf("--session") + 1] : "ses_" + genId();
  let session = loadSession(sessionId) || { id: sessionId, messages: [] };
  console.log("Session:", sessionId);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  rl.prompt();
  rl.on("line", (line: string) => {
    const input = line.trim();
    if (!input || input === "\\exit") { rl.close(); return; }
    const t0 = Date.now();
    Effect.runPromise(runAgent(input)).then(r => {
      console.log(r);
      console.error(`[${((Date.now() - t0) / 1000).toFixed(2)}s]`);
    }).catch(e => console.error("Error:", e.message));
    rl.prompt();
  });
} else if (cmd === "session") {
  ensureDir(SESSION_DIR);
  if (args[0] === "list") {
    fs.readdirSync(SESSION_DIR).filter(f => f.endsWith(".json")).forEach(f => {
      const s = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf-8"));
      console.log(s.id);
    });
  }
} else {
  console.log("sec - Effect Agent CLI\nUsage: sec run <prompt> | sec chat");
}
