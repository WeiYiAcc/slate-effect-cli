import { OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Redacted, Schema, pipe } from "effect";
import { Agent, AgentRuntime } from "effect-agent";
import { AgentPolicy } from "effect-agent/AgentPolicy";
import { ThreadHistory } from "effect-agent/ThreadHistory";
import { IdGenerator } from "effect-agent/IdGenerator";
import { FetchHttpClient } from "effect/unstable/http";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
import { spawn } from "child_process";

import { SecToolkit, SecToolkitLayer } from "./tools/sec-tools.js";

// Config
const CLIPROXY_URL = "https://cliproxy.wyrunning.dpdns.org/v1";
const CLIPROXY_KEY = "ak7548697";
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
  instructions: "You are sec, a CLI agent with powerful tools. You MUST always respond with valid JSON like RESPJSON. You have access to: read (file contents), bash (execute commands), edit (replace file content), websearch (search web). Use these tools when helpful. Never respond with plain text outside JSON.",
  toolkit: SecToolkit,
  policy: AgentPolicy.make({
    maxTurns: 5, maxToolCalls: 10, maxDuration: "60 seconds", toolConcurrency: 2,
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
    Effect.provide(SecToolkitLayer),
  );
}
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
  if (args.includes("--use-sqlite")) return cmdChatCelld(args.filter(a => a !== "--use-sqlite"));
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

// celld-backed chat with MAKA-style Event Log (uses spawnSync to avoid Effect fiber issues)
function cmdChatCelld(args: string[]) {
  let sessionId: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--session" || args[i] === "-s") sessionId = args[++i];
  }
  let session = sessionId ? getSession(sessionId) : null;
  if (!session) {
    sessionId = "ses_" + genId();
    session = createSession("Chat " + new Date().toISOString(), MODEL);
    session.id = sessionId;
  }
  console.log("Session: " + session.id + " [celld SQLite]");
  console.log("Commands: exit, history, events, usage, clear");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  rl.prompt();
  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }
    if (input === "exit") { rl.close(); return; }
    if (input === "history") {
      console.log("--- History (" + session!.entries.length + " messages) ---");
      for (const e of session!.entries) { console.log("[" + e.role + "] " + e.content.slice(0, 100)); }
      console.log("--- End ---");
      rl.prompt(); return;
    }
    if (input === "events") {
      const evs = getEvents(session!.id);
      console.log("--- Events (" + evs.length + ") ---");
      for (const e of evs) {
        const d = typeof e.data === "string" ? e.data : JSON.stringify(e.data).slice(0, 150);
        console.log("[" + e.ts.slice(11, 19) + "] " + e.type + ": " + d);
      }
      console.log("--- End ---");
      rl.prompt(); return;
    }
    if (input === "usage") {
      const u = getTotalUsage(session!.id);
      console.log("Usage: input=" + u.inputTokens + " output=" + u.outputTokens + " cost=$" + u.cost.toFixed(6));
      rl.prompt(); return;
    }
    if (input === "clear") { session!.entries = []; updateSession(session!); console.log("Session cleared"); rl.prompt(); return; }
    const t0 = Date.now();
    appendEvent(session!.id, { id: genId(), type: "user_message", ts: new Date().toISOString(), data: { content: input } });
    session!.entries.push({ id: genId(), role: "user", content: input, ts: new Date().toISOString() });
    try {
      const result = Bun.spawnSync({ cmd: [BUN_BIN, SELF_SCRIPT, "run", input], stdout: "pipe", stderr: "pipe", timeout: 60000 });
      const stdout = String(result.stdout || "").trim();
      const stderr = String(result.stderr || "");
      if (!stdout || stderr.includes("safe integers") || stderr.includes("usage fields")) {
        const retry = Bun.spawnSync({ cmd: [BUN_BIN, SELF_SCRIPT, "run", input], stdout: "pipe", stderr: "pipe", timeout: 60000 });
        const out2 = String(retry.stdout || "").trim();
        const err2 = String(retry.stderr || "");
        if (!out2) {
          const errLine = err2.split(g).find((l: string) => l.includes("Error")) || err2.slice(0, 300);
          throw new Error(errLine);
        }
        console.log(out2);
        appendEvent(session!.id, { id: genId(), type: "assistant_message", ts: new Date().toISOString(), data: { content: out2, duration_ms: Date.now() - t0 } });
        session!.entries.push({ id: genId(), role: "assistant", content: out2, ts: new Date().toISOString() });
      } else {
        console.log(stdout);
        appendEvent(session!.id, { id: genId(), type: "assistant_message", ts: new Date().toISOString(), data: { content: stdout, duration_ms: Date.now() - t0 } });
        session!.entries.push({ id: genId(), role: "assistant", content: stdout, ts: new Date().toISOString() });
      }
      console.error("[" + ((Date.now() - t0) / 1000).toFixed(2) + "s]");
      updateSession(session!);
    } catch (err: any) {
      console.error("Error:", err.message || String(err));
      appendEvent(session!.id, { id: genId(), type: "error", ts: new Date().toISOString(), data: { message: err.message || String(err) } });
    }
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



// ========== Multica 集成命令 ==========

async function cmdAgent(args: string[]) {
  const sub = args[0];
  if (sub === "list") {
    const result = Bun.spawnSync({
      cmd: ["multica", "agent", "list", "--output", "json"],
      stdout: "pipe",
    });
    try {
      const agents = JSON.parse(result.stdout.toString());
      console.log("Agents:");
      for (const a of agents.slice(0, 20)) {
        const name = a.name || a.id;
        const desc = (a.description || "").slice(0, 50);
        const runtime = (a.runtime_id || "N/A").slice(0, 8);
        console.log(`  ${name.padEnd(30)} [${runtime}...]  ${desc}`);
      }
      if (agents.length > 20) console.log(`  ... and ${agents.length - 20} more`);
    } catch { console.log(result.stdout.toString()); }
  } else if (sub === "invoke") {
    const [name, ...promptParts] = args.slice(1);
    if (!name || !promptParts.length) { console.error("Usage: sec agent invoke <name> <prompt>"); process.exit(1); }
    const prompt = promptParts.join(" ");
    console.log(`Invoking agent: ${name}`);
    console.log(`Prompt: ${prompt}`);
    // 调用 multica agent
    const result = Bun.spawnSync({
      cmd: ["multica", "agent", "get", name, "--output", "json"],
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) {
      console.error(`Agent not found: ${name}`);
      process.exit(1);
    }
    try {
      const agent = JSON.parse(result.stdout.toString());
      console.log(`Agent ID: ${agent.id}`);
      console.log(`Description: ${agent.description}`);
      console.log("Use 'multica issue create --assignee <name> --title <prompt>' to create a task for this agent");
    } catch { console.log(result.stdout.toString()); }
  } else if (sub === "status") {
    const [name] = args.slice(1);
    if (!name) { console.error("Usage: sec agent status <name>"); process.exit(1); }
    const result = Bun.spawnSync({
      cmd: ["multica", "agent", "get", name, "--output", "json"],
      stdout: "pipe",
    });
    try {
      const agent = JSON.parse(result.stdout.toString());
      console.log(`Agent: ${agent.name}`);
      console.log(`ID: ${agent.id}`);
      console.log(`Runtime: ${agent.runtime_id || "N/A"}`);
      console.log(`Created: ${agent.created_at}`);
      console.log(`Archived: ${agent.archived_at || "No"}`);
    } catch { console.log(result.stdout.toString()); }
  } else {
    console.log("Usage: sec agent <list|invoke|status>");
  }
}

async function cmdIssue(args: string[]) {
  const sub = args[0];
  if (sub === "list") {
    const result = Bun.spawnSync({
      cmd: ["multica", "issue", "list", "--output", "json"],
      stdout: "pipe",
    });
    try {
      const data = JSON.parse(result.stdout.toString());
      const issues = data.issues || data;
      console.log(`Issues (${issues.length}):`);
      for (const i of issues.slice(0, 20)) {
        const id = (i.id || "N/A").slice(0, 8);
        const status = (i.status || "?").padEnd(12);
        const title = (i.title || "N/A").slice(0, 50);
        console.log(`  [${id}] ${status} ${title}`);
      }
    } catch { console.log(result.stdout.toString()); }
  } else if (sub === "create") {
    const title = args.slice(1).join(" ");
    if (!title) { console.error("Usage: sec issue create <title>"); process.exit(1); }
    console.log(`Creating issue: ${title}`);
    const result = Bun.spawnSync({
      cmd: ["multica", "issue", "create", "--title", title, "--output", "json"],
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) {
      console.error(result.stderr.toString());
      process.exit(1);
    }
    try {
      const issue = JSON.parse(result.stdout.toString());
      console.log(`Created: ${issue.id}`);
      console.log(`Title: ${issue.title}`);
    } catch { console.log(result.stdout.toString()); }
  } else if (sub === "show") {
    const [id] = args.slice(1);
    if (!id) { console.error("Usage: sec issue show <id>"); process.exit(1); }
    const result = Bun.spawnSync({
      cmd: ["multica", "issue", "get", id, "--output", "json"],
      stdout: "pipe",
    });
    try {
      const issue = JSON.parse(result.stdout.toString());
      console.log(`ID: ${issue.id}`);
      console.log(`Title: ${issue.title}`);
      console.log(`Status: ${issue.status}`);
      console.log(`Description: ${issue.description || "N/A"}`);
    } catch { console.log(result.stdout.toString()); }
  } else {
    console.log("Usage: sec issue <list|create|show>");
  }
}

async function cmdRuntime(args: string[]) {
  const sub = args[0];
  if (sub === "list") {
    const result = Bun.spawnSync({
      cmd: ["multica", "runtime", "list", "--output", "json"],
      stdout: "pipe",
    });
    try {
      const data = JSON.parse(result.stdout.toString());
      const runtimes = data.runtimes || data;
      console.log(`Runtimes (${runtimes.length}):`);
      for (const r of runtimes) {
        const id = (r.id || "N/A").slice(0, 8);
        const name = (r.name || "N/A").padEnd(50);
        const status = (r.status || "?").padEnd(10);
        console.log(`  [${id}] ${status} ${name}`);
      }
    } catch { console.log(result.stdout.toString()); }
  } else {
    console.log("Usage: sec runtime list");
  }
}

async function cmdModels(args: string[]) {
  // 列出 cliproxyapi/gproxy 支持的模型
  const result = Bun.spawnSync({
    cmd: ["curl", "-s", "http://127.0.0.1:8317/v1/models", "-H", "Authorization: Bearer ak-local-cpa"],
    stdout: "pipe",
  });
  try {
    const data = JSON.parse(result.stdout.toString());
    const models = data.data || [];
    console.log(`Available models (${models.length}):`);
    for (const m of models.slice(0, 30)) {
      const id = m.id || "N/A";
      const owned = m.owned_by || "N/A";
      console.log(`  ${id.padEnd(50)} ${owned}`);
    }
  } catch { 
    console.log("无法获取模型列表，可能 cliproxyapi 未运行");
  }
}

function printHelp() {
  console.log(`sec - Effect Agent CLI (powered by @effect/ai-openrouter)

Usage:
  sec run <prompt> [--background] [--timeout N]   Single AI call
  sec chat [--session ID]                           Chat session
  sec session new [title]                         Create session
  sec session list                                List sessions
  sec session show <ID>                           Show session
  sec session rm <ID>                             Remove session
  sec jobs list                                   List jobs
  sec jobs rm <ID>                                Remove job
  sec status <JOB_ID>                              Check job status

Multica Integration:
  sec agent list                                  List multica agents
  sec agent invoke <name> <prompt>                Invoke agent
  sec agent status <name>                         Agent status
  sec issue list                                  List issues
  sec issue create <title>                        Create issue
  sec issue show <ID>                             Show issue
  sec runtime list                                List runtimes

Utilities:
  sec models                                      List available models`);
}

// ========== celld SQLite Storage ==========
import { createSession, getSession, updateSession, listSessions, deleteSession, appendEvent, getEvents, recordUsage, getTotalUsage } from "./storage/celld-session-storage.js";

function cmdSqlite(args: string[]) {
  const sub = args[0];
  if (sub === "new") {
    const title = args.slice(1).join(" ") || "New session";
    const s = createSession(title);
    console.log("Created:", s.id);
  } else if (sub === "list") {
    const sessions = listSessions();
    console.log("Sessions (" + sessions.length + "):");
    for (const s of sessions) {
      console.log("  " + s.id + "  " + (s.title || "Untitled") + "  [" + s.eventCount + " events]  " + (s.updated_at || s.created_at));
    }
  } else if (sub === "show") {
    const s = getSession(args[1]);
    if (!s) { console.error("Session not found"); return; }
    console.log(JSON.stringify(s, null, 2));
  } else if (sub === "events") {
    const events = getEvents(args[1]);
    console.log("Events (" + events.length + "):");
    for (const e of events) {
      console.log("  [" + e.ts + "] " + e.type + ": " + JSON.stringify(e.data).slice(0, 200));
    }
  } else if (sub === "rm") {
    const ok = deleteSession(args[1]);
    console.log(ok ? "Deleted" : "Not found");
  } else if (sub === "usage") {
    const u = getTotalUsage(args[1]);
    console.log("Total usage for " + args[1] + ":");
    console.log("  Input tokens: " + u.inputTokens);
    console.log("  Output tokens: " + u.outputTokens);
    console.log("  Cost: $" + u.cost.toFixed(6));
  } else {
    console.log("sec sqlite - celld-backed session storage");
    console.log("Usage: sec sqlite new|list|show|events|rm|usage");
  }
}

// Main
const cmd = process.argv[2];
const args = process.argv.slice(3);

if (!cmd) { printHelp(); process.exit(0); }
else if (cmd === "run") cmdRun(args);
else if (cmd === "chat") cmdChat(args);
else if (cmd === "session") cmdSession(args);
else if (cmd === "status") cmdStatus(args);
else if (cmd === "jobs") cmdJobs(args);
else if (cmd === "job") cmdJobRun(args.slice(1));
else if (cmd === "agent") cmdAgent(args);
else if (cmd === "issue") cmdIssue(args);
else if (cmd === "runtime") cmdRuntime(args);
else if (cmd === "models") cmdModels(args);
else if (cmd === "sqlite") cmdSqlite(args);
else { printHelp(); }

