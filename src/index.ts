import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"
import * as os from "os"
import { spawn } from "child_process"

const SESSION_DIR = path.join(os.homedir(), ".local", "share", "sec", "sessions")
const RUNTIME_DIR = path.join(os.homedir(), ".local", "share", "sec", "runtime")
const CLIPROXY_URL = "http://127.0.0.1:8317/v1/chat/completions"
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
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }] }),
      signal: controller.signal,
    })
    const data = await resp.json()
    return data.choices?.[0]?.message?.content || "No response"
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

async function runChat(sessionId) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "sec> " })
  let session = sessionId ? loadSession(sessionId) : null
  if (!session) {
    session = { id: genSessionId(), title: "New Chat", messages: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    saveSession(session)
    console.log("New session: " + session.id)
  }
  console.log("sec chat - type quit to exit, clear to clear history")
  rl.prompt()
  rl.on("line", async (line) => {
    const input = line.trim()
    if (!input) { rl.prompt(); return }
    if (input === "quit") { rl.close(); return }
    if (input === "clear") { session.messages = []; saveSession(session); console.log("History cleared."); rl.prompt(); return }
    session.messages.push({ role: "user", content: input, ts: new Date().toISOString() })
    saveSession(session)
    try {
      const resp = await callLLM(input)
      console.log(resp)
      session.messages.push({ role: "assistant", content: resp, ts: new Date().toISOString() })
      saveSession(session)
    } catch (err) { console.error("Error:", err.message) }
    rl.prompt()
  })
  rl.on("close", () => { console.log("Session " + session.id + " saved."); process.exit(0) })
}

function sessionNew(title) {
  const s = { id: genSessionId(), title: title || "New Session", messages: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  saveSession(s)
  console.log(JSON.stringify(s, null, 2))
}

function sessionList() {
  if (!fs.existsSync(SESSION_DIR)) { console.log("No sessions."); return }
  const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith(".json")).sort().reverse()
  if (files.length === 0) { console.log("No sessions."); return }
  for (const f of files) {
    const s = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf-8"))
    const preview = s.messages && s.messages.length > 0 ? s.messages[s.messages.length - 1].content.slice(0, 50) : "(empty)"
    console.log(s.id + " | " + (s.title || "Untitled") + " | " + s.updated_at + " | " + preview)
  }
}

function sessionShow(id) {
  const s = loadSession(id)
  if (!s) { console.error("Session " + id + " not found."); process.exit(1) }
  console.log(JSON.stringify(s, null, 2))
}

function sessionRm(id) {
  const f = path.join(SESSION_DIR, id + ".json")
  if (!fs.existsSync(f)) { console.error("Session " + id + " not found."); process.exit(1) }
  fs.unlinkSync(f)
  console.log("Session " + id + " removed.")
}

function jobStatus(id) {
  const j = loadJob(id)
  if (!j) { console.error("Job " + id + " not found."); process.exit(1) }
  console.log(JSON.stringify(j, null, 2))
}

function jobList() {
  if (!fs.existsSync(RUNTIME_DIR)) { console.log("No jobs."); return }
  const files = fs.readdirSync(RUNTIME_DIR).filter(f => f.endsWith(".json")).sort().reverse()
  if (files.length === 0) { console.log("No jobs."); return }
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, f), "utf-8"))
    console.log(j.id + " | " + j.status + " | " + (j.prompt?.slice(0, 50) || "") + " | " + j.started_at)
  }
}

function jobRm(id) {
  deleteJob(id)
  console.log("Job " + id + " removed.")
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

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") { printHelp(); process.exit(0) }
  
  const command = args[0]
  
  // Internal command for background execution
  if (command === "job" && args[1] === "run") {
    await jobRun(args[2], args[3], args[4] || String(DEFAULT_TIMEOUT_MS))
    process.exit(0)
  }
  
  switch (command) {
    case "run": {
      const background = args.includes("--background")
      const promptArgs = args.slice(1).filter(a => !a.startsWith("--"))
      const prompt = promptArgs.join(" ")
      if (!prompt) { console.error("Usage: sec run <prompt> [--background]"); process.exit(1) }
      if (background) {
        const jobId = runBackground(prompt, DEFAULT_TIMEOUT_MS)
        console.log("[sec] Background job started: " + jobId)
        console.log("[sec] Track with: sec status " + jobId)
      } else {
        await runForeground(prompt, DEFAULT_TIMEOUT_MS)
      }
      break
    }
    case "chat": {
      let sessionId: string | undefined
      const idx = args.indexOf("--session")
      if (idx > 0) sessionId = args[idx + 1]
      await runChat(sessionId)
      break
    }
    case "session": {
      const sub = args[1]
      switch (sub) {
        case "new": sessionNew(args[2]); break
        case "list": sessionList(); break
        case "show": if (!args[2]) { console.error("Usage: sec session show <ID>"); process.exit(1) }; sessionShow(args[2]); break
        case "rm": if (!args[2]) { console.error("Usage: sec session rm <ID>"); process.exit(1) }; sessionRm(args[2]); break
        default: console.error("Unknown: new/list/show/rm"); process.exit(1)
      }
      break
    }
    case "jobs": {
      if (args[1] === "list") jobList()
      else if (args[1] === "rm" && args[2]) jobRm(args[2])
      else console.error("Usage: sec jobs <list|rm <ID>>")
      break
    }
    case "status": {
      if (!args[1]) { console.error("Usage: sec status <JOB_ID>"); process.exit(1) }
      jobStatus(args[1])
      break
    }
    default: console.error("Unknown command: " + command); printHelp(); process.exit(1)
  }
}

main().catch(err => { console.error("Fatal error:", err); process.exit(1) })
