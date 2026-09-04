/**
 * sec - Simple Effect-native AI CLI
 * 
 * A minimal implementation that works out of the box
 */

import { Effect, Schema, Redacted } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Agent, AgentRuntime, ThreadHistory } from "effect-agent";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as os from "os";

// =============================================================================
// Schema - minimal types
// =============================================================================

export class UserMessage extends Schema.Class<UserMessage>("UserMessage")({
  content: Schema.String,
}) {}

export class AiResponse extends Schema.Class<AiResponse>("AiResponse")({
  response: Schema.String,
}) {}

// =============================================================================
// Simple tools for file, bash, edit, and web search
// =============================================================================

// Read tool
export const ReadTool = {
  name: "read",
  description: "Read file contents",
  parameters: { path: { type: "string" } },
  execute: async ({ path }) => {
    try {
      const content = fs.readFileSync(path, "utf-8");
      return { content };
    } catch (e) {
      throw new Error(`Failed to read file ${path}: ${e.message}`);
    }
  },
};

// Bash tool
export const BashTool = {
  name: "bash",
  description: "Execute bash command",
  parameters: { command: { type: "string" }, cwd: { type: "string", optional: true } },
  execute: async ({ command, cwd }) => {
    const { spawn } = await import("child_process");
    const result = await new Promise((resolve) => {
      const proc = spawn("bash", ["-c", command], {
        cwd: cwd || process.cwd(),
      });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => (stdout += d.toString()));
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => resolve({ stdout, stderr, exitCode: code }));
    });
    return result;
  },
};

// Edit tool
export const EditTool = {
  name: "edit",
  description: "Edit file",
  parameters: { path: { type: "string" }, old: { type: "string" }, new: { type: "string" } },
  execute: async (params) => {
    const { path, old, new: newContent } = params;
    try {
      const content = fs.readFileSync(path, "utf-8");
      const index = content.indexOf(old);
      if (index === -1) throw new Error("Old content not found");
      const updated = content.slice(0, index) + newContent + content.slice(index + old.length);
      fs.writeFileSync(path, updated, "utf-8");
      return { path };
    } catch (e) {
      throw new Error(`Failed to edit file ${path}: ${e.message}`);
    }
  },
};

// WebSearch tool
export const WebSearchTool = {
  name: "websearch",
  description: "Search DuckDuckGo",
  parameters: { query: { type: "string" } },
  execute: async ({ query }) => {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return { results: (data.results || []).slice(0, 10) };
    } catch (e) {
      throw new Error(`Web search failed: ${e.message}`);
    }
  },
};

// =============================================================================
// Simple Agent - minimal
// =============================================================================

export const SecAgent = Agent.make("sec", {
  input: UserMessage,
  output: AiResponse,
  instructions: ({ content }) =>
    Effect.succeed(`You are sec, respond to: ${content}`),
  toolkit: { tools: [] },
  policy: {},
});

// =============================================================================
// Simple Session Management
// =============================================================================

const SESSION_DIR = path.join(os.homedir(), ".local", "share", "sec", "sessions");

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function generateSessionId() {
  return "ses_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function saveSession(session) {
  ensureSessionDir();
  session.updated_at = new Date().toISOString();
  const file = path.join(SESSION_DIR, `${session.id}.json`);
  fs.writeFileSync(file, JSON.stringify(session, null, 2));
}

// =============================================================================
// Simple Agent runner
// =============================================================================

async function runSecAgent(message) {
  // Simple HTTP call to cliproxyapi
  try {
    const response = await fetch("http://127.0.0.1:8317/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ak-local-cpa",
      },
      body: JSON.stringify({
        model: "openrouter/openrouter/free",
        messages: [{ role: "user", content: message }],
      }),
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (e) {
    throw new Error(`AI call failed: ${e.message}`);
  }
}

// =============================================================================
// CLI Interface - simple
// =============================================================================

function printHelp() {
  console.log(`sec - Simple AI CLI

Usage:
  sec run <prompt>        Single AI call
  sec chat [--session ID]  Chat session
  sec session new [title]   Create session
  sec session list         List sessions
`);
}

async function runSingleCall(prompt) {
  try {
    const response = await runSecAgent(prompt);
    console.log(response);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

async function runChat(sessionId) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "sec> " });

  let session = null;
  if (sessionId) {
    const file = path.join(SESSION_DIR, `${sessionId}.json`);
    if (fs.existsSync(file)) {
      session = JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  }
  if (!session) {
    session = { id: generateSessionId(), title: "New Session", messages: [] };
  }

  console.log(`sec chat - Session: ${session.id}\n`);

  const processLine = (input) => {
    if (!input || input === "quit" || input === "exit") {
      saveSession(session);
      process.exit(0);
    }

    session.messages.push({ role: "user", content: input });
    saveSession(session);

    runSecAgent(input)
      .then((response) => {
        session.messages.push({ role: "assistant", content: response });
        saveSession(session);
        console.log(response);
      })
      .catch((err) => console.error("Error:", err))
      .finally(() => rl.prompt());
  };

  rl.on("line", processLine);
  rl.prompt();
}

async function runSessionCommand(action, args) {
  switch (action) {
    case "new": {
      ensureSessionDir();
      const id = generateSessionId();
      const title = args.join(" ") || "New Session";
      const session = { id, title, messages: [] };
      saveSession(session);
      console.log(`Created: ${id}`);
      break;
    }
    case "list": {
      ensureSessionDir();
      const files = fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith(".json"));
      if (files.length === 0) {
        console.log("No sessions.");
        return;
      }
      console.log("ID                 | Title");
      console.log("-------------------- | -----------------");
      for (const f of files) {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf-8"));
          console.log(s.id.padEnd(20) + " | " + s.title.slice(0, 17));
        } catch {}
      }
      break;
    }
    case "show": {
      const id = args[0];
      if (!id) {
        console.error("Usage: sec session show <id>");
        process.exit(1);
      }
      const file = path.join(SESSION_DIR, `${id}.json`);
      if (fs.existsSync(file)) {
        const s = JSON.parse(fs.readFileSync(file, "utf-8"));
        console.log(`Session: ${s.id}\nTitle: ${s.title}\n`);
        for (const m of s.messages) {
          console.log(`[${m.role}] ${m.content}\n`);
        }
      } else {
        console.error(`Session not found: ${id}`);
        process.exit(1);
      }
      break;
    }
    case "rm": {
      const id = args[0];
      if (!id) {
        console.error("Usage: sec session rm <id>");
        process.exit(1);
      }
      const file = path.join(SESSION_DIR, `${id}.json`);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`Deleted: ${id}`);
      } else {
        console.error(`Session not found: ${id}`);
        process.exit(1);
      }
      break;
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
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
      const sIdx = argv.indexOf("--session");
      const sessionId = sIdx !== -1 ? argv[sIdx + 1] : undefined;
      await runChat(sessionId);
      break;
    }
    case "session": {
      const action = argv[1] || "list";
      const args = argv.slice(2);
      await runSessionCommand(action, args);
      break;
    }
    default: {
      await runSingleCall(command + " " + argv.slice(1).join(" "));
    }
  }
}

main();
