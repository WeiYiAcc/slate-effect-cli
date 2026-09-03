/**
 * slate-effect-cli (sec) - Minimal AI CLI with sessions
 * 
 * Commands:
 *   sec run <prompt>       - Single AI call
 *   sec chat [--session ID] - REPL chat (with session persistence)
 *   sec acp                - ACP agent mode
 *   sec serve              - HTTP server
 *   sec models             - List models
 *   sec session <action>   - Session management
 *     new [title]          - Create new session
 *     list                 - List all sessions
 *     show <id>            - Show session details
 *     rm <id>              - Delete session
 */

import { getFreeModelsConfig, selectFreeModel, chatCompletion } from "./providers/cliproxyapi.ts";
import { Effect } from "effect";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Session management
const SESSION_DIR = path.join(os.homedir(), ".local", "share", "sec", "sessions");
const SESSION_FILE = (id: string) => path.join(SESSION_DIR, `${id}.json`);

interface SessionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: SessionMessage[];
}

function ensureSessionDir(): void {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

function generateSessionId(): string {
  return "ses_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function createSession(title?: string): Session {
  ensureSessionDir();
  const id = generateSessionId();
  const now = new Date().toISOString();
  const session: Session = {
    id,
    title: title || "New Session",
    created_at: now,
    updated_at: now,
    messages: []
  };
  saveSession(session);
  return session;
}

function loadSession(id: string): Session | null {
  const file = SESSION_FILE(id);
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function saveSession(session: Session): void {
  ensureSessionDir();
  session.updated_at = new Date().toISOString();
  fs.writeFileSync(SESSION_FILE(session.id), JSON.stringify(session, null, 2));
}

function listSessions(): Session[] {
  ensureSessionDir();
  const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith(".json"));
  const sessions: Session[] = [];
  for (const f of files) {
    try {
      const session: Session = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf-8"));
      sessions.push(session);
    } catch {}
  }
  // Sort by updated_at descending
  sessions.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return sessions;
}

function deleteSession(id: string): boolean {
  const file = SESSION_FILE(id);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    return true;
  }
  return false;
}

// AI call
async function aiCall(messages: SessionMessage[]): Promise<string> {
  const config = getFreeModelsConfig();
  const selection = await Effect.runPromise(selectFreeModel);
  const response = await Effect.runPromise(
    chatCompletion(config, selection.modelId, messages, {
      temperature: 0.7,
      maxTokens: 8192
    })
  );
  return response;
}

function printHelp(): void {
  console.log(`sec - Minimal AI CLI

Usage:
  sec run <prompt>            Single AI call
  sec chat [--session ID]    REPL chat session
  sec acp                     ACP agent mode
  sec serve [--port N]        HTTP server
  sec models                  List available models
  sec session new [title]     Create new session
  sec session list            List all sessions
  sec session show <id>       Show session details
  sec session rm <id>         Delete session

Options:
  --help, -h         Show this help
  --version, -v       Show version
`);
}

function printVersion(): void {
  console.log("sec v1.0.0");
}

async function runSingleCall(prompt: string): Promise<void> {
  try {
    const response = await aiCall([
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt }
    ]);
    console.log(response);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

async function runChat(sessionId?: string): Promise<void> {
  const readline = await import("readline");
  
  // Load or create session
  let session: Session | null = null;
  if (sessionId) {
    session = loadSession(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found. Creating new one.`);
      session = createSession();
    }
  } else {
    session = createSession();
  }
  
  console.log(`sec chat - Session: ${session.id} - ${session.title}`);
  console.log(`Messages: ${session.messages.length} | Type 'quit' to exit\n`);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "sec> "
  });
  
  rl.prompt();
  
  rl.on("line", async (input: string) => {
    const line = input.trim();
    
    if (!line) {
      rl.prompt();
      return;
    }
    
    if (line === "quit" || line === "exit") {
      saveSession(session!);
      console.log(`\nSession saved: ${session!.id}`);
      process.exit(0);
    }
    
    if (line === "clear") {
      console.clear();
      rl.prompt();
      return;
    }
    
    // Add user message
    session!.messages.push({ role: "user", content: line });
    
    // Get AI response
    try {
      const response = await aiCall(session!.messages);
      session!.messages.push({ role: "assistant", content: response });
      
      // Auto-save after each exchange
      saveSession(session!);
      
      console.log(response);
    } catch (err) {
      console.error("Error:", err);
    }
    
    rl.prompt();
  });
  
  rl.on("close", () => {
    saveSession(session!);
    console.log(`\nSession saved: ${session!.id}`);
    process.exit(0);
  });
}

async function runSession(action: string, args: string[]): Promise<void> {
  switch (action) {
    case "new": {
      const title = args.join(" ") || "New Session";
      const session = createSession(title);
      console.log(`Created: ${session.id}`);
      console.log(`Title: ${session.title}`);
      console.log(`Path: ${SESSION_FILE(session.id)}`);
      break;
    }
    
    case "list": {
      const sessions = listSessions();
      if (sessions.length === 0) {
        console.log("No sessions found.");
        return;
      }
      console.log("ID                   | Title              | Updated             | Msgs");
      console.log("-------------------- | ------------------ | ------------------- | ----");
      for (const s of sessions) {
        const updated = s.updated_at.slice(0, 19).replace("T", " ");
        console.log(
          s.id.padEnd(20) + " | " +
          s.title.slice(0, 18).padEnd(18) + " | " +
          updated + " | " +
          s.messages.length.toString()
        );
      }
      break;
    }
    
    case "show": {
      const id = args[0];
      if (!id) {
        console.error("Usage: sec session show <id>");
        process.exit(1);
      }
      const session = loadSession(id);
      if (!session) {
        console.error(`Session not found: ${id}`);
        process.exit(1);
      }
      console.log(`Session: ${session.id}`);
      console.log(`Title: ${session.title}`);
      console.log(`Created: ${session.created_at}`);
      console.log(`Updated: ${session.updated_at}`);
      console.log(`Messages: ${session.messages.length}\n`);
      for (const m of session.messages) {
        const role = m.role === "user" ? "User" : "AI";
        console.log(`[${role}] ${m.content}\n`);
      }
      break;
    }
    
    case "rm":
    case "delete": {
      const id = args[0];
      if (!id) {
        console.error("Usage: sec session rm <id>");
        process.exit(1);
      }
      if (deleteSession(id)) {
        console.log(`Deleted: ${id}`);
      } else {
        console.error(`Session not found: ${id}`);
        process.exit(1);
      }
      break;
    }
    
    default:
      console.error(`Unknown session action: ${action}`);
      console.error("Available: new, list, show, rm");
      process.exit(1);
  }
}

async function runModels(): Promise<void> {
  try {
    const config = getFreeModelsConfig();
    console.log("Available models:");
    console.log(`  Provider: ${config.providerName}`);
    console.log(`  Free models: ${config.freeModels.join(", ")}`);
    console.log(`  Default: openrouter/openrouter/free`);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    return;
  }
  
  if (argv[0] === "--version" || argv[0] === "-v") {
    printVersion();
    return;
  }
  
  const command = argv[0];
  
  switch (command) {
    case "run": {
      const prompt = argv.slice(1).join(" ");
      if (!prompt) {
        console.error("Error: no prompt");
        process.exit(1);
      }
      await runSingleCall(prompt);
      break;
    }
    
    case "chat": {
      // Parse --session flag
      let sessionId: string | undefined;
      const sessionIdx = argv.indexOf("--session");
      if (sessionIdx !== -1 && argv[sessionIdx + 1]) {
        sessionId = argv[sessionIdx + 1];
      }
      const sIdx = argv.indexOf("-s");
      if (sIdx !== -1 && argv[sIdx + 1]) {
        sessionId = argv[sIdx + 1];
      }
      await runChat(sessionId);
      break;
    }
    
    case "acp": {
      // Read prompt from stdin
      const readline = await import("readline");
      const rl = readline.createInterface({ input: process.stdin });
      let prompt = "";
      for await (const line of rl) {
        prompt += line + "\n";
      }
      await runSingleCall(prompt);
      break;
    }
    
    case "serve": {
      const portIdx = argv.indexOf("--port");
      const port = portIdx !== -1 ? Number(argv[portIdx + 1]) : 8080;
      console.log(`HTTP server on port ${port} (not implemented yet)`);
      break;
    }
    
    case "models": {
      await runModels();
      break;
    }
    
    case "session": {
      const action = argv[1] || "list";
      const args = argv.slice(2);
      await runSession(action, args);
      break;
    }
    
    default: {
      // Treat as single call
      await runSingleCall(command + " " + argv.slice(1).join(" "));
      break;
    }
  }
}

main();
