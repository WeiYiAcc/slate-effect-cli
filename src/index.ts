import { OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Redacted, Schema, pipe } from "effect";
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
import { spawn } from "child_process";

// Config
const CLIPROXY_URL = "https://cliproxy.wyrunning.dpdns.org/v1";
const CLIPROXY_KEY = "ak7548697"; // VPS cliproxyapi key
const MODEL = "openrouter/openrouter/free";
const DEFAULT_TIMEOUT_MS = 30000;
const SESSION_DIR = path.join(os.homedir(), ".local", "share", "sec", "sessions");
const RUNTIME_DIR = path.join(os.homedir(), ".local", "share", "sec", "runtime");
const BUN_BIN = "/home/weiyiacc/.local/share/mise/installs/bun/1.4.0/bin/bun";
const SELF_SCRIPT = "/home/weiyiacc/slate-effect-cli/src/index.ts";

// Helpers
function ensureDir(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function genSessionId() { return "ses_" + genId(); }
function genJobId() { return "job_" + genId(); }

function loadSession(id: string) {
  const f = path.join(SESSION_DIR, id + ".json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf-8")) : null;
}
function saveSession(s: any) {
  ensureDir(SESSION_DIR);
  s.updated_at = new Date().toISOString();
  fs.writeFileSync(path.join(SESSION_DIR, s.id + ".json"), JSON.stringify(s, null, 2));
}
function loadJob(id: string) {
  const f = path.join(RUNTIME_DIR, id + ".json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf-8")) : null;
}
function saveJob(j: any) {
  ensureDir(RUNTIME_DIR);
  j.updated_at = new Date().toISOString();
  fs.writeFileSync(path.join(RUNTIME_DIR, j.id + ".json"), JSON.stringify(j, null, 2));
}
function deleteJob(id: string) {
  const f = path.join(RUNTIME_DIR, id + ".json");
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

// Agent definition
const secAgent = Agent.make("sec", {
  input: Schema.String,
  output: Schema.Struct({ response: Schema.String }),
  instructions: 'You MUST always respond with valid JSON like {"response": "your answer here"}. Never respond with plain text.',
  toolkit: Toolkit.empty,
  policy: AgentPolicy.make({
    maxTurns: 3, maxToolCalls: 5, maxDuration: "30 seconds", toolConcurrency: 1,
  }),
});

// Create the Effect program
function createProgram(prompt: string) {
  return pipe(
    Effect.gen(function* () {
      const result = yield* AgentRuntime.run(secAgent, prompt);
      const out = result.output as { response: string };
      return out.response;
    }),
    Effect.provide(OpenRouterLanguageModel.model(MODEL)),
    Effect.provide(OpenRouterClient.layer({ apiKey: Redacted.make(CLIPROXY_KEY), apiUrl: CLIPROXY_URL })),
    Effect.provide(FetchHttpClient.layer),
    Effect.provide(IdGenerator.layer),
    Effect.provide(ThreadHistory.layerTransient),
  );
}

// Run agent with native timeout
async function runAgent(prompt: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const program = createProgram(prompt);
    const result = await Effect.runPromise(program);
    return result;
  } catch (err: any) {
    if (err.name === "AbortError") throw new Error("Request timed out after " + timeoutMs + "ms");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// CLI commands
async function cmdRun(args: string[]) {
  let background = false;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const promptParts: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--background" || args[i] === "-b") background = true;
    else if (args[i] === "--timeout") { timeoutMs = parseInt(args[++i]) * 1000; }
    else if (args[i] === "--timeout-ms") { timeoutMs = parseInt(args[++i]); }
    else promptParts.push(args[i]);
  }
  
  const prompt = promptParts.join(" ").trim();
  if (!prompt) { console.error("Usage: sec run <prompt> [--background] [--timeout N]"); process.exit(1); }
  
  if (background) {
    const jobId = genJobId();
    const job = { id: jobId, type: "llm", prompt, status: "pending", started_at: new Date().toISOString(), timeout: timeoutMs };
    saveJob(job);
    const child = spawn(BUN_BIN, [SELF_SCRIPT, "job", "run", jobId, prompt, String(timeoutMs)], { detached: true, stdio: "ignore" });
    child.unref();
    console.log(jobId);
  } else {
    const t0 = Date.now();
    try {
      const resp = await runAgent(prompt, timeoutMs);
      console.log(resp);
      console.error("[sec] Done in " + ((Date.now() - t0) / 1000).toFixed(2) + "s");
    } catch (err: any) {
      console.error("Error:", err.message || err);
      process.exit(1);
    }
  }
}

async function cmdJobRun(args: string[]) {
  const [jobId, prompt, timeoutStr] = args;
  const timeoutMs = parseInt(timeoutStr) || DEFAULT_TIMEOUT_MS;
  const job = loadJob(jobId);
  if (!job) { console.error("Job not found: " + jobId); process.exit(1); }
  job.status = "running";
  saveJob(job);
  try {
    const resp = await runAgent(prompt, timeoutMs);
    job.status = "completed";
    job.result = resp;
    job.completed_at = new Date().toISOString();
    saveJob(job);
  } catch (err: any) {
    job.status = "failed";
    job.error = err.message || String(err);
    job.completed_at = new Date().toISOString();
    saveJob(job);
  }
}

function cmdChat(args: string[]) {
  let sessionId: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--session" || args[i] === "-s") sessionId = args[++i];
  }
  if (!sessionId) sessionId = genSessionId();
  let session = loadSession(sessionId);
  if (!session) { session = { id: sessionId, title: "Chat " + new Date().toISOString(), messages: [], created_at: new Date().toISOString() }; saveSession(session); }
  console.log("Session: " + sessionId);
  console.log("Type 'exit' to quit, 'clear' to reset, 'history' to view");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  rl.prompt();
  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }
    if (input === "exit") { rl.close(); return; }
    if (input === "clear") { session!.messages = []; saveSession(session!); console.log("Session cleared"); rl.prompt(); return; }
    if (input === "history") { session!.messages.forEach((m: any, i: number) => console.log("[" + i + "] " + m.role + ": " + m.content)); rl.prompt(); return; }
    session!.messages.push({ role: "user", content: input });
    try {
      const t0 = Date.now();
      const resp = await runAgent(input, 60000);
      console.log(resp);
      console.error("[sec] " + ((Date.now() - t0) / 1000).toFixed(2) + "s");
      session!.messages.push({ role: "assistant", content: resp });
      saveSession(session!);
    } catch (err: any) { console.error("Error:", err.message || err); }
    rl.prompt();
  });
  rl.on("close", () => process.exit(0));
}

function cmdSession(args: string[]) {
  const sub = args[0];
  if (sub === "new") {
    const title = args.slice(1).join(" ") || "Session " + new Date().toISOString();
    const id = genSessionId();
    saveSession({ id, title, messages: [], created_at: new Date().toISOString() });
    console.log(id);
  } else if (sub === "list") {
    ensureDir(SESSION_DIR);
    const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith(".json"));
    if (files.length === 0) { console.log("No sessions"); return; }
    files.forEach(f => {
      const s = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf-8"));
      console.log(s.id + "  " + s.title + "  (" + s.messages.length + " messages)  " + s.created_at);
    });
  } else if (sub === "show") {
    const id = args[1];
    if (!id) { console.error("Usage: sec session show <ID>"); process.exit(1); }
    const s = loadSession(id);
    if (!s) { console.error("Session not found: " + id); process.exit(1); }
    console.log("ID: " + s.id);
    console.log("Title: " + s.title);
    console.log("Created: " + s.created_at);
    console.log("Messages: " + s.messages.length);
    s.messages.forEach((m: any, i: number) => console.log("--- [" + i + "] " + m.role + " ---"));
    console.log(m.content);
  } else if (sub === "rm") {
    const id = args[1];
    if (!id) { console.error("Usage: sec session rm <ID>"); process.exit(1); }
    const f = path.join(SESSION_DIR, id + ".json");
    if (!fs.existsSync(f)) { console.error("Session not found: " + id); process.exit(1); }
    fs.unlinkSync(f);
    console.log("Removed: " + id);
  } else {
    console.error("Usage: sec session <new|list|show|rm> [args...]"); process.exit(1);
  }
}

function cmdStatus(args: string[]) {
  const id = args[0];
  if (!id) { console.error("Usage: sec status <JOB_ID>"); process.exit(1); }
  const job = loadJob(id);
  if (!job) { console.error("Job not found: " + id); process.exit(1); }
  console.log("ID: " + job.id);
  console.log("Status: " + job.status);
  console.log("Prompt: " + job.prompt);
  console.log("Started: " + job.started_at);
  if (job.completed_at) console.log("Completed: " + job.completed_at);
  if (job.result) console.log("Result: " + job.result);
  if (job.error) console.log("Error: " + job.error);
}

function cmdJobs(args: string[]) {
  const sub = args[0];
  ensureDir(RUNTIME_DIR);
  if (sub === "list") {
    const files = fs.readdirSync(RUNTIME_DIR).filter(f => f.endsWith(".json"));
    if (files.length === 0) { console.log("No jobs"); return; }
    files.forEach(f => {
      const j = JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, f), "utf-8"));
      console.log(j.id + "  " + j.status + "  " + j.prompt.slice(0, 50) + "  " + j.started_at);
    });
  } else if (sub === "rm") {
    const id = args[1];
    if (!id) { console.error("Usage: sec jobs rm <ID>"); process.exit(1); }
    deleteJob(id);
    console.log("Removed: " + id);
  } else {
    console.error("Usage: sec jobs <list|rm>"); process.exit(1);
  }
}

function printHelp() {
  console.log("sec - Effect Agent CLI (powered by @effect/ai-openrouter)");
  console.log("");
  console.log("Usage:");
  console.log("  sec run <prompt> [--background] [--timeout N]   Single AI call");
  console.log("  sec chat [--session ID]                           Chat session");
  console.log("  sec session new [title]                         Create session");
  console.log("  sec session list                                List sessions");
  console.log("  sec session show <ID>                           Show session");
  console.log("  sec session rm <ID>                             Remove session");
  console.log("  sec jobs list                                   List jobs");
  console.log("  sec jobs rm <ID>                                Remove job");
  console.log("  sec status <JOB_ID>                              Check job status");
}

// Main
const cmd = process.argv[2];
const args = process.argv.slice(3);

if (cmd === "run") cmdRun(args);
else if (cmd === "chat") cmdChat(args);
else if (cmd === "session") cmdSession(args);
else if (cmd === "status") cmdStatus(args);
else if (cmd === "jobs") cmdJobs(args);
else if (cmd === "job") cmdJobRun(args.slice(1)); // skip 'run'
else { printHelp(); }
