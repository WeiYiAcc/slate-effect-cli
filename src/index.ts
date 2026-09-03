/**
 * sec - Effect-native AI CLI using Effect Agent framework
 * 
 * 基于 effect-agent 的 schema-first runtime model 重写
 * 参考: effect-agent/packages/testing/src/fixtures/travel-planner/definition.ts
 */

import { Effect, Schema, Context, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Agent, AgentPolicy, AgentRuntime, ThreadHistory, IdGenerator } from "effect-agent";
import { Tool, Toolkit } from "effect/unstable/ai";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as os from "os";

// =============================================================================
// 1. Schema 定义
// =============================================================================

/** 用户消息 */
export class UserMessage extends Schema.Class<UserMessage>("UserMessage")({
  content: Schema.String,
}) {}

/** AI 回复 */
export class AiResponse extends Schema.Class<AiResponse>("AiResponse")({
  response: Schema.String,
}) {}

/** Read 工具参数 */
export class ReadParams extends Schema.Class<ReadParams>("ReadParams")({
  path: Schema.String,
  offset: Schema.Int.check(Schema.isNonNegative).pipe(Schema.optional),
  limit: Schema.Int.check(Schema.isPositive).pipe(Schema.optional),
}) {}

/** Read 工具成功结果 */
export class ReadSuccess extends Schema.Class<ReadSuccess>("ReadSuccess")({
  content: Schema.String,
}) {}

/** Read 工具失败 */
export class ReadError extends Schema.TaggedError<ReadError>()("ReadError", {
  message: Schema.String,
}) {}

/** Bash 工具参数 */
export class BashParams extends Schema.Class<BashParams>("BashParams")({
  command: Schema.String,
  cwd: Schema.String.pipe(Schema.optional),
}) {}

/** Bash 工具成功结果 */
export class BashSuccess extends Schema.Class<BashSuccess>("BashSuccess")({
  stdout: Schema.String,
  stderr: Schema.String,
  exitCode: Schema.Int,
}) {}

/** Bash 工具失败 */
export class BashError extends Schema.TaggedError<BashError>()("BashError", {
  message: Schema.String,
}) {}

// =============================================================================
// 2. Tool 定义 (使用 Tool.make)
// =============================================================================

export const ReadTool = Tool.make("read", {
  description: "Read file contents",
  parameters: ReadParams,
  success: ReadSuccess,
  failure: ReadError,
  failureMode: "error",
});

export const BashTool = Tool.make("bash", {
  description: "Execute bash command",
  parameters: BashParams,
  success: BashSuccess,
  failure: BashError,
  failureMode: "error",
});

// =============================================================================
// 3. Toolkit 组合
// =============================================================================

export const SecToolkit = Toolkit.make(ReadTool, BashTool);

// =============================================================================
// 4. Toolkit Layer (工具实现)
// =============================================================================

export const SecToolkitLayer = SecToolkit.toLayer({
  read: ({ path: filePath, offset, limit }) =>
    Effect.gen(function* () {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const start = offset ?? 0;
        const end = limit ? start + limit : lines.length;
        return {
          content: lines.slice(start, end).join("\n"),
        };
      } catch (e) {
        return yield* Effect.fail(new ReadError({ 
          message: e instanceof Error ? e.message : String(e) 
        }));
      }
    }),
  

  bash: ({ command, cwd }) =>
    Effect.promise(() =>
      (async () => {
        try {
          const result = Bun.spawn({
            cmd: ["bash", "-c", command],
            cwd: cwd ?? os.homedir(),
          });
          const stdout = await new Response(result.stdout).text();
          const stderr = await new Response(result.stderr).text();
          return {
            stdout,
            stderr,
            exitCode: result.exitCode,
          };
        } catch (e) {
          throw new BashError({ 
            message: e instanceof Error ? e.message : String(e) 
          });
        }
      })()
    ),

});

// =============================================================================
// 5. Agent 定义
// =============================================================================

export const SecAgent = Agent.make("sec", {
  input: UserMessage,
  output: AiResponse,
  instructions: ({ content }) =>
    Effect.succeed(`You are sec, a helpful AI assistant. Respond to: ${content}`),
  toolkit: Toolkit.empty,
  policy: AgentPolicy.make({
    maxTurns: 2,
    maxToolCalls: 1,
    maxDuration: "30 seconds",
    toolConcurrency: 1,
  }),
  description: "A helpful AI assistant.",
});

// =============================================================================
// 6. CLIProxyAPI Provider
// =============================================================================

import { Redacted } from "effect";

const CLI_PROXY_CONFIG = {
  apiKey: Redacted.make("ak-local-cpa"),
  baseUrl: "http://127.0.0.1:8317",
  model: "openrouter/openrouter/free",
};

// =============================================================================
// 7. Session 管理
// =============================================================================

const SESSION_DIR = path.join(os.homedir(), ".local", "share", "sec", "sessions");

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: Array<{ role: string; content: string }>;
}

function ensureSessionDir(): void {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

function generateSessionId(): string {
  return "ses_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadSession(id: string): Session | null {
  const file = path.join(SESSION_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function saveSession(session: Session): void {
  ensureSessionDir();
  session.updated_at = new Date().toISOString();
  const file = path.join(SESSION_DIR, `${session.id}.json`);
  fs.writeFileSync(file, JSON.stringify(session, null, 2));
}

// =============================================================================
// 8. 运行 Agent
// =============================================================================

async function runSecAgent(message: string): Promise<string> {
  const program = Effect.gen(function* () {
    // 运行 agent
    const result = yield* AgentRuntime.run(SecAgent, { content: message });
    return result.output.response;
  }).pipe(
    // 提供模型
    Effect.provide(
      OpenAiLanguageModel.model(CLI_PROXY_CONFIG.model)
    ),
    // 提供 client
    Effect.provide(
      OpenAiClient.layer({
        apiKey: CLI_PROXY_CONFIG.apiKey,
        apiUrl: `${CLI_PROXY_CONFIG.baseUrl}/v1`,
      })
    ),
    // 提供历史
    Effect.provide(ThreadHistory.layerTransient),
    // 提供 HTTP 客户端
    Effect.provide(FetchHttpClient.layer),
    // 提供 ID 生成器
    Effect.provide(IdGenerator.layer),
  );

  return Effect.runPromise(program);
}

// =============================================================================
// 9. CLI 入口
// =============================================================================

function printHelp(): void {
  console.log(`sec - Effect-native AI CLI

Usage:
  sec run <prompt>            Single AI call
  sec chat [--session ID]     REPL chat session
  sec session new [title]     Create new session
  sec session list            List all sessions
  sec session show <id>       Show session details
  sec session rm <id>         Delete session
`);
}

async function runSingleCall(prompt: string): Promise<void> {
  try {
    const response = await runSecAgent(prompt);
    console.log(response);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

async function runChat(sessionId?: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "sec> ",
  });

  let session: Session | null = null;
  if (sessionId) {
    session = loadSession(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      process.exit(1);
    }
  } else {
    ensureSessionDir();
    const id = generateSessionId();
    session = {
      id,
      title: "New Session",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: [],
    };
  }

  console.log(`sec chat - Session: ${session.id}\n`);

  const processLine = (input: string) => {
    const line = input.trim();
    if (!line || line === "quit" || line === "exit") {
      saveSession(session!);
      process.exit(0);
    }

    session!.messages.push({ role: "user", content: line });
    saveSession(session!);

    runSecAgent(line)
      .then((response) => {
        session!.messages.push({ role: "assistant", content: response });
        saveSession(session!);
        console.log(response);
      })
      .catch((err) => {
        console.error("Error:", err.message);
      })
      .finally(() => {
        rl.prompt();
      });
  };

  rl.on("line", processLine);
  rl.prompt();
}

async function runSessionCommand(action: string, args: string[]): Promise<void> {
  switch (action) {
    case "new": {
      ensureSessionDir();
      const id = generateSessionId();
      const title = args.join(" ") || "New Session";
      const session: Session = {
        id,
        title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
      };
      saveSession(session);
      console.log(`Created: ${id}`);
      break;
    }
    case "list": {
      ensureSessionDir();
      const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith(".json"));
      if (files.length === 0) {
        console.log("No sessions.");
        return;
      }
      console.log("ID                   | Title              | Updated");
      console.log("-------------------- | ------------------ | -------------------");
      for (const f of files) {
        try {
          const s: Session = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf-8"));
          const updated = s.updated_at.slice(0, 19).replace("T", " ");
          console.log(s.id.padEnd(20) + " | " + s.title.slice(0, 18).padEnd(18) + " | " + updated);
        } catch {}
      }
      break;
    }
    case "show": {
      const id = args[0];
      if (!id) { console.error("Usage: sec session show <id>"); process.exit(1); }
      const s = loadSession(id);
      if (!s) { console.error(`Session not found: ${id}`); process.exit(1); }
      console.log(`Session: ${s.id}\nTitle: ${s.title}\n`);
      for (const m of s.messages) {
        console.log(`[${m.role}] ${m.content}\n`);
      }
      break;
    }
    case "rm":
    case "delete": {
      const id = args[0];
      if (!id) { console.error("Usage: sec session rm <id>"); process.exit(1); }
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
    default:
      console.error(`Unknown action: ${action}`);
      process.exit(1);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    return;
  }

  const command = argv[0];

  switch (command) {
    case "run": {
      const prompt = argv.slice(1).join(" ");
      if (!prompt) { console.error("Error: no prompt"); process.exit(1); }
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
