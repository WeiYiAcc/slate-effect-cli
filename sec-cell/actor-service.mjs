
// SEC Agent Service - 简化的 Actor 模式 (Node.js)
// 不依赖 rivetkit，直接实现 actor 核心概念

import { createServer } from "http";

const PORT = 9878;
const HOST = "127.0.0.1";

// 简单的 Actor 管理器
class ActorManager {
  constructor() {
    this.actors = new Map(); // id -> ActorInstance
  }
  
  async getOrCreate(actorId, createFn) {
    if (!this.actors.has(actorId)) {
      this.actors.set(actorId, await createFn());
    }
    return this.actors.get(actorId);
  }
}

const manager = new ActorManager();

// SEC Agent Actor 工厂
function createSecAgent() {
  const state = {
    name: "SEC-Agent",
    status: "ready",
    lastExecution: "",
    history: [],
  };
  
  return {
    state,
    
    actions: {
      async execute(req) {
        state.lastExecution = new Date().toISOString();
        state.history.push(req.code);
        state.status = "executing";
        
        try {
          const fn = new Function("return (async () => { " + req.code + " })()");
          const result = await fn();
          state.status = "ready";
          return { success: true, output: String(result), timestamp: state.lastExecution };
        } catch (e) {
          state.status = "ready";
          return { success: false, error: e.message };
        }
      },
      
      status() {
        return {
          name: state.name,
          status: state.status,
          lastExecution: state.lastExecution,
          historyCount: state.history.length,
        };
      },
      
      history() {
        return state.history;
      },
      
      clearHistory() {
        state.history = [];
        return { success: true };
      },
    },
  };
}

// HTTP Server
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const actorId = url.searchParams.get("id") || "default";
  
  // 获取或创建 actor
  const actor = await manager.getOrCreate(actorId, createSecAgent);
  
  if (url.pathname === "/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "ok", service: "sec-agent", actors: manager.actors.size }));
    return;
  }
  
  if (url.pathname === "/api/agent/status") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(actor.actions.status()));
    return;
  }
  
  if (url.pathname === "/api/agent/execute") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        const result = await actor.actions.execute(data);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (e) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }
  
  if (url.pathname === "/api/agent/history") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(actor.actions.history()));
    return;
  }
  
  res.statusCode = 404;
  res.end("Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`SEC Agent service listening on http://${HOST}:${PORT}`);
});
