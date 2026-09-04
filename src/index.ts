import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"
import * as os from "os"
import { spawn } from "child_process"

const SESSION_DIR = path.join(os.homedir(), ".local", "share", "sec", "sessions")
const RUNTIME_DIR = path.join(os.homedir(), ".local", "share", "sec", "runtime")
const CLIPROXY_URL = "http://127.0.0.1:8317/v1/responses"
const CLIPROXY_KEY = "ak-local-cpa"
const MODEL = "openrouter/openrouter/free"
const DEFAULT_TIMEOUT_MS = 30000
const BUN_BIN = "/home/weiyiacc/.local/share/mise/installs/bun/1.4.0/bin/bun"
const SELF_SCRIPT = "/home/weiyiacc/slate-effect-cli/src/index.ts"

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }
function ensureSessionDir() { ensureDir(SESSION_DIR) }
function ensureRuntimeDir() { ensureDir(RUNTIME_DIR) }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function genSessionId() { return "ses_" + genId() }
function genJobId() { return "job_" + genId() }

function loadSession(id) {
  const f = path.join(SESSION_DIR, id + ".json")
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf-8")) : null
}
function saveSession(s) {
  ensureSessionDir(); s.updated_at = new Date().toISOString()
  fs.writeFileSync(path.join(SESSION_DIR, s.id + ".json"), JSON.stringify(s, null, 2))
}
function loadJob(id) {
  const f = path.join(RUNTIME_DIR, id + ".json")
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf-8")) : null
}
function saveJob(j) {
  ensureRuntimeDir(); j.updated_at = new Date().toISOString()
  fs.writeFileSync(path.join(RUNTIME_DIR, j.id + ".json"), JSON.stringify(j, null, 2))
}
function deleteJob(id) {
  const f = path.join(RUNTIME_DIR, id + ".json")
  if (fs.existsSync(f)) fs.unlinkSync(f)
}

async function callLLM(prompt, timeoutMs) {
  const ms = timeoutMs || DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const resp = await fetch(CLIPROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + CLIPROXY_KEY },
      body: JSON.stringify({ model: MODEL, input: prompt }),
      signal: controller.signal,
    })
    const data = await resp.json()
    const output = data.output || []
    for (const item of output) {
      if (item.type === "message" && item.content) {
        for (const part of item.content) {
          if (part.type === "output_text" && part.text) {
            return part.text
          }
        }
      }
    }
    return "No response"
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out after " + ms + "ms")
    throw err
  } finally { clearTimeout(timer) }
}

async function runForeground(prompt, timeoutMs) {
  const t0 = Date.now()
  try {
    const resp = await callLLM(prompt, timeoutMs)
    console.log(resp)
    console.error("[sec] Done in " + ((Date.now() - t0) / 1000).toFixed(2) + "s")
  } catch (err) { console.error("Error:", err.message); process.exit(1) }
}

function runBackground(prompt, timeoutMs) {
  const jobId = genJobId()
  const job = { id: jobId, type: "llm", prompt, status: "pending", started_at: new Date().toISOString(), timeout: timeoutMs }
  saveJob(job)
  const child = spawn(BUN_BIN, [SELF_SCRIPT, "job", "run", jobId, prompt, String(timeoutMs)], { detached: true, stdio: "ignore" })
  child.unref()
  return jobId
}

async function jobRun(jobId, prompt, timeoutMs) {
  const ms = parseInt(timeoutMs) || DEFAULT_TIMEOUT_MS
  const job = loadJob(jobId)
  if (!job) { console.error("Job not found: " + jobId); process.exit(1) }
  job.status = "running"
  saveJob(job)
  try {
    const resp = await callLLM(prompt, ms)
    job.status = "completed"
    job.result = resp
    job.completed_at = new Date().toISOString()
    saveJob(job)
  } catch (err) {
    job.status = "failed"
    job.error = err.message
    job.completed_at = new Date().toISOString()
    saveJob(job)
  }
}

function cmdRun(args) {
  let background = false
  let timeoutMs = DEFAULT_TIMEOUT_MS
  const promptParts = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--background" || args[i] === "-b") background = true
    else if (args[i] === "--timeout") { timeoutMs = parseInt(args[++i]) * 1000 }
    else if (args[i] === "--timeout-ms") { timeoutMs = parseInt(args[++i]) }
    else promptParts.push(args[i])
  }
  const prompt = promptParts.join(" ").trim()
  if (!prompt) { console.error("Usage: sec run <prompt> [--background]"); process.exit(1) }
  if (background) {
    const jobId = runBackground(prompt, timeoutMs)
    console.log(jobId)
  } else {
    runForeground(prompt, timeoutMs)
  }
}

function cmdChat(args) {
  let sessionId = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--session" || args[i] === "-s") sessionId = args[++i]
  }
  if (!sessionId) sessionId = genSessionId()
  let session = loadSession(sessionId)
  if (!session) { session = { id: sessionId, title: "Chat " + new Date().toISOString(), messages: [], created_at: new Date().toISOString() }; saveSession(session) }
  console.log("Session: " + sessionId)
  console.log("Type exit to quit, clear to reset, history to view")
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "> " })
  rl.prompt()
  rl.on("line", async (line) => {
    const input = line.trim()
    if (!input) { rl.prompt(); return }
    if (input === "exit") { rl.close(); return }
    if (input === "clear") { session.messages = []; saveSession(session); console.log("Session cleared"); rl.prompt(); return }
    if (input === "history") { session.messages.forEach((m, i) => console.log("[" + i + "] " + m.role + ": " + m.content)); rl.prompt(); return }
    session.messages.push({ role: "user", content: input })
    try {
      const t0 = Date.now()
      const resp = await callLLM(input, 60000)
      console.log(resp)
      console.error("[sec] " + ((Date.now() - t0) / 1000).toFixed(2) + "s")
      session.messages.push({ role: "assistant", content: resp })
      saveSession(session)
    } catch (err) { console.error("Error:", err.message) }
    rl.prompt()
  })
  rl.on("close", () => process.exit(0))
}

function cmdSession(args) {
  const sub = args[0]
  if (sub === "new") {
    const title = args.slice(1).join(" ") || "Session " + new Date().toISOString()
    const id = genSessionId()
    saveSession({ id, title, messages: [], created_at: new Date().toISOString() })
    console.log(id)
  } else if (sub === "list") {
    ensureSessionDir()
    const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith(".json"))
    if (files.length === 0) { console.log("No sessions"); return }
    files.forEach(f => {
      const s = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf-8"))
      console.log(s.id + "  " + s.title + "  (" + s.messages.length + " messages)  " + s.created_at)
    })
  } else if (sub === "show") {
    const id = args[1]
    if (!id) { console.error("Usage: sec session show <ID>"); process.exit(1) }
    const s = loadSession(id)
    if (!s) { console.error("Session not found: " + id); process.exit(1) }
    console.log("ID: " + s.id)
    console.log("Title: " + s.title)
    console.log("Created: " + s.created_at)
    console.log("Messages: " + s.messages.length)
    s.messages.forEach((m, i) => console.log("--- [" + i + "] " + m.role + " ---"))
    console.log(m.content)
  } else if (sub === "rm") {
    const id = args[1]
    if (!id) { console.error("Usage: sec session rm <ID>"); process.exit(1) }
    const f = path.join(SESSION_DIR, id + ".json")
    if (!fs.existsSync(f)) { console.error("Session not found: " + id); process.exit(1) }
    fs.unlinkSync(f)
    console.log("Removed: " + id)
  } else {
    console.error("Usage: sec session <new|list|show|rm> [args...]"); process.exit(1)
  }
}

function cmdStatus(args) {
  const id = args[0]
  if (!id) { console.error("Usage: sec status <JOB_ID>"); process.exit(1) }
  const job = loadJob(id)
  if (!job) { console.error("Job not found: " + id); process.exit(1) }
  console.log("ID: " + job.id)
  console.log("Status: " + job.status)
  console.log("Prompt: " + job.prompt)
  console.log("Started: " + job.started_at)
  if (job.completed_at) console.log("Completed: " + job.completed_at)
  if (job.result) console.log("Result: " + job.result)
  if (job.error) console.log("Error: " + job.error)
}

function cmdJobs(args) {
  const sub = args[0]
  ensureRuntimeDir()
  if (sub === "list") {
    const files = fs.readdirSync(RUNTIME_DIR).filter(f => f.endsWith(".json"))
    if (files.length === 0) { console.log("No jobs"); return }
    files.forEach(f => {
      const j = JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, f), "utf-8"))
      console.log(j.id + "  " + j.status + "  " + j.prompt.slice(0, 50) + "  " + j.started_at)
    })
  } else if (sub === "rm") {
    const id = args[1]
    if (!id) { console.error("Usage: sec jobs rm <ID>"); process.exit(1) }
    deleteJob(id)
    console.log("Removed: " + id)
  } else {
    console.error("Usage: sec jobs <list|rm>"); process.exit(1)
  }
}

function printHelp() {
  console.log("sec - Effect Agent CLI")
  console.log("")
  console.log("Usage:")
  console.log("  sec run <prompt> [--background]     Single AI call (background or foreground)")
  console.log("  sec chat [--session ID]             Chat session with multi-turn")
  console.log("  sec session new [title]             Create session")
  console.log("  sec session list                    List sessions")
  console.log("  sec session show <ID>               Show session details")
  console.log("  sec session rm <ID>                 Remove session")
  console.log("  sec jobs list                       List background jobs")
  console.log("  sec jobs rm <ID>                    Remove a job")
  console.log("  sec status <JOB_ID>                 Check job status")
}

const cmd = process.argv[2]
const args = process.argv.slice(3)
if (cmd === "run") cmdRun(args)
else if (cmd === "chat") cmdChat(args)
else if (cmd === "session") cmdSession(args)
else if (cmd === "status") cmdStatus(args)
else if (cmd === "jobs") cmdJobs(args)
else if (cmd === "job") jobRun(args[0], args[1], args[2])
else { printHelp() }
