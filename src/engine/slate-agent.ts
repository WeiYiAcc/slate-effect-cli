/**
 * slate-agent.ts — Agent definitions for the slate goal engine.
 *
 * This implements the planner → worker → verifier loop that slate's goal
 * system is famous for, as an Effect Agent definition.
 *
 * The goal system works as follows:
 * 1. Planner: Breaks down the objective into sub-tasks
 * 2. Worker: Executes each sub-task (tool calls, file operations, etc.)
 * 3. Verifier: Checks that requirements are met
 * 4. If gaps found, they feed back into the planner
 * 5. When all gaps are filled, the goal is complete
 */
import { Effect, Layer, Ref, pipe, Context, Schema } from "effect";
import { AgentId, AgentRuntime, AgentPolicy, Toolkit, Definition } from "@effect-agent/core";
import type { SessionId, RunId, GoalInput, WorkflowRun, FileEntry } from "../types/index.ts";
import { listFiles as slateListFiles, readFile as slateReadFile } from "../tools/slate-tools.ts";
import { makeSlateToolkit } from "../tools/slate-tools.ts";

// ---------------------------------------------------------------------------
// Goal State
// ---------------------------------------------------------------------------

type GoalState = {
  /** The original objective. */
  readonly objective: string;
  /** Timeout in seconds (or undefined for no timeout). */
  readonly timeout: number | undefined;
  /** Whether to wait for completion. */
  readonly wait: boolean;
  /** Current status. */
  readonly status: "running" | "completed" | "failed" | "timeout";
  /** The current workflow run ID. */
  readonly currentRun: RunId | undefined;
  /** History of all runs. */
  readonly runHistory: ReadonlyArray<WorkflowRun>;
  /** Assistant messages collected so far. */
  readonly messages: ReadonlyArray<{ role: string; text: string }>;
  /** Files that have been read. */
  readonly filesRead: ReadonlyArray<FilePath>;
  /** Results accumulated during execution. */
  readonly results: ReadonlyArray<unknown>;
};

// ---------------------------------------------------------------------------
// Helper: Parse model output into structured data
// ---------------------------------------------------------------------------

function parseGoalResponse(text: string): {
  readonly kind: string;
  readonly status: string;
  readonly name: string;
  readonly suggestion?: string;
} {
  // Very simple parser - would use a proper schema in production
  const lower = text.toLowerCase();
  if (lower.includes("goal satisfied")) {
    return { kind: "completed", status: "completed", name: "goal satisfied" };
  }
  if (lower.includes("tool validation error") || lower.includes("validation error")) {
    return { kind: "failed", status: "failed", name: "tool validation error" };
  }
  if (lower.includes("gaps") || lower.includes("next steps")) {
    return { kind: "suggesting", status: "running", name: "need more work", suggestion: text };
  }
  return { kind: "unknown", status: "running", name: text.substring(0, 50) };
}

// ---------------------------------------------------------------------------
// The Slate Goal Definition
//
// This Definition implements the core goal engine using Effect Agent's
// primitives: tool-based loop, subagent delegation, compaction, etc.
/**
 * Creates a Definition that runs a slate goal.
 *
 * @param objective The goal/objective to accomplish
 * @param timeoutSeconds Optional timeout in seconds
 * @param wait Whether to block until the goal completes
 */
export function createSlateGoalDefinition(
  objective: string,
  timeoutSeconds?: number,
  wait: boolean = true,
): Definition<
  { readonly input: { objective: string; timeout?: number; wait?: boolean } },
  { readonly result: { status: string; runs: WorkflowRun[]; finalMessage?: string } },
  { readonly instructions: string },
  Toolkit.Any,
  {
    readonly runDisposition?: { schema: Schema.Schema; fromOutput: (output: unknown) => unknown } | undefined;
    readonly completion?: {
      readonly tool: string;
      readonly required?: boolean;
      readonly project: (input: {
        readonly parameters: unknown;
        readonly result: unknown;
      }) => unknown;
    } | undefined;
  }
> {
  // Build the policy from the timeout
  const policy: AgentPolicy = {
    maxTurns: timeoutSeconds ?? 3600,
    maxToolCalls: 100,
    maxDurationSeconds: timeoutSeconds ?? 3600 * 1000,
    onExhaustion: "fail",
    // Allow compaction after 5 turns to manage context
    allowCompaction: true,
    compactionThresholdTokens: 80_000,
  };

  // The main agent loop
  const goalAgent: Effect.Effect<unknown, never, {
    readonly runtime: AgentRuntime;
    readonly slateService: typeof SlateService;
    readonly slateToolkit: typeof makeSlateToolkit;
  }> = Effect.gen(function* () {
    // First, ensure we have a slate server and toolkit
    yield* Layer.get[typeof makeSlateToolkit]();
    yield* Layer.get[typeof SlateService]();

    // Create or reuse a session
    const sessionRes = yield* makeSlateToolkit()["slate:createSession"]({ title: objective });
    const session = yield* Effect.promise(() => {
      const text = sessionRes;
      const parsed = JSON.parse(text);
      return parsed.id;
    }) as SessionId;

    // Send the goal command to the session
    yield* makeSlateToolkit()["slate:sendCommand"]({ sessionId: session, command: "goal", args: objective });

    // Main agent loop
    const results: unknown[] = [];
    let allStatuses: string[] = [];

    for (let turn = 0; turn < (timeoutSeconds ?? 3600); turn++) {
      // Poll for workflow runs and messages
      const runsRes = yield* makeSlateToolkit()["slate:listWorkflowRuns"]({ sessionId: session });
      const runs: WorkflowRun[] = JSON.parse(runsRes).filter((r: any) => r.sessionId === session);
      allStatuses.push(...runs.map((r: any) => r.status));

      // Get session messages
      const messagesRes = yield* makeSlateToolkit()["slate:getSessionMessages"]({ sessionId: session, limit: 50 });
      const messages = JSON.parse(messagesRes);

      // Extract assistant text
      let assistantText = "";
      for (const m of messages) {
        if (m.role === "assistant" && m.content && m.content.type === "text") {
          assistantText += m.text ?? "";
        }
      }

      // Check for completion
      if (/goal satisfied|goal complete/i.test(assistantText)) {
        return {
          status: "completed",
          runs,
          finalMessage: extractAssistantText(messages),
        };
      }

      // Check for failures
      if (runs.some((r: any) => r.status === "failed")) {
        return {
          status: "failed",
          runs,
          finalMessage: "goal failed during execution",
        };
      }

      // If not waiting or we've gathered enough, break
      if (!wait) break;
    }

    return {
      status: "running" as const,
      runs: [] as WorkflowRun[],
      finalMessage: undefined,
    };
  });

  // Return the Definition
  return {
    id: AgentId.generate(),
    instructions: objective,
    toolkit: makeSlateToolkit(),
    policy,
    // No explicit completion - the loop handles completion itself
    runDisposition: undefined,
    completion: undefined,
  };
}

// ---------------------------------------------------------------------------
// Utility: Extract assistant text from messages
// ---------------------------------------------------------------------------

function extractAssistantText(messages: unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: { type?: string; text?: string } };
    if (m?.role !== "assistant" || !m.content) continue;
    const text = m.content.type === "text" ? (m.content.text ?? undefined) : undefined;
    if (text) return text;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type { GoalState, WorkflowRun };
export type { parseGoalResponse };

export { createSlateGoalDefinition };
