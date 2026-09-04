
// SEC Agent Service v3.1 - IIFE fix
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const PORT = 9878;
const HOST = "127.0.0.1";

const STORAGE_DIR = process.env.CELLD_STATE_DIR || "/tmp/sec-agent-state";
if (!existsSync(STORAGE_DIR)) mkdirSync(STORAGE_DIR, { recursive: true });

function loadState(actorId) {
  const path = join(STORAGE_DIR, actorId + ".json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : {
    name: "SEC-Agent", status: "ready", createdAt: new Date().toISOString(),
    lastExecution: "", history: [],
  };
}

function saveState(actorId, state) {
  writeFileSync(join(STORAGE_DIR, actorId + ".json"), JSON.stringify(state, null, 2));
}

class ActorManager {
  constructor() { this.actors = new Map(); }
  getOrCreate(actorId) {
    if (!this.actors.has(actorId)) this.actors.set(actorId, { state: loadState(actorId), actorId });
    return this.actors.get(actorId);
  }
  save(actorId) { saveState(actorId, this.actors.get(actorId)?.state); }
}

const manager = new ActorManager();

// 沙箱执行 - 用 IIFE 直接返回 code 的值
async function runInSandbox(code, language = "javascript") {
  const start = Date.now();
  
  if (language === "javascript") {
    try {
      // IIFE 直接包裹 code，返回 code 的值
      const fn = new Function(`return (async () => (${code}))()`);
      const result = await fn();
      const output = typeof result === "object" && result !== null
        ? JSON.stringify(result)
        : String(result);
      return { success: true, output, duration: Date.now() - start, exitCode: 0 };
    } catch (e) {
      return { success: false, error: e.message, duration: Date.now() - start, exitCode: 1 };
    }
  }
  return { success: false, error: `Unsupported: ${language}`, exitCode: 1 };
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const actorId = url.searchParams.get("id") || "default";
  const actor = manager.getOrCreate(actorId);
  
  if (url.pathname === "/health") {
    res.end(JSON.stringify({ status: "ok", service: "sec-agent", v: "3.1", storage: STORAGE_DIR }));
    return;
  }
  
  if (url.pathname === "/api/agent/execute") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { code, language } = JSON.parse(body);
        actor.state.lastExecution = new Date().toISOString();
        actor.state.history.push({ code, language, ts: actor.state.lastExecution });
        actor.state.status = "executing";
        manager.save(actorId);
        const result = await runInSandbox(code, language);
        actor.state.status = "ready";
        manager.save(actorId);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }
  
  if (url.pathname === "/api/agent/status") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ id: actorId, ...actor.state, historyLen: actor.state.history.length }));
    return;
  }
  
  if (url.pathname === "/api/agent/history") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(actor.state.history));
    return;
  }
  
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`SEC Agent v3.1 on http://${HOST}:${PORT}`);
});
