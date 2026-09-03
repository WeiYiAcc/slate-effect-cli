/**
 * slate-service.ts — Core HTTP service for slate CLI.
 *
 * Provides typed HTTP wrappers for the slate server API.
 */
import { Effect } from "effect";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

/**
 * Slate server connection info
 */
export const SlateServerBrand = Symbol.for("slate.server");
export type SlateServer = {
  readonly [SlateServerBrand]: true;
  readonly baseUrl: string;
  readonly dir: string;
};
export type SlateService = SlateServer;

/** Create a SlateServer value */
export function makeSlateServer(baseUrl: string, dir: string): SlateServer {
  return { [SlateServerBrand]: true, baseUrl, dir };
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class SlateError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "SlateError";
  }
}

// ---------------------------------------------------------------------------
// Low-level HTTP helpers
// ---------------------------------------------------------------------------

function httpRequest<T>(method: string, url: string, body?: unknown): Effect.Effect<T, SlateError> {
  return Effect.gen(function* () {
    const options: RequestInit = {
      method,
      headers: { "content-type": "application/json" },
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }
    
    const res = yield* Effect.promise(() => fetch(url, options));
    
    if (!res.ok) {
      const text = yield* Effect.promise(() => res.text());
      return yield* Effect.fail(new SlateError(`${method} ${url} -> HTTP ${res.status}: ${text}`, res.status));
    }
    
    const text = yield* Effect.promise(() => res.text());
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  });
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/** Check if a slate server is healthy. */
export const healthCheck = (baseUrl: string): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    try {
      const res = yield* Effect.promise(() =>
        fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(1500) })
      );
      if (!res.ok) return false;
      const j: { healthy?: boolean } = yield* Effect.promise(() => res.json());
      return !!j?.healthy;
    } catch {
      return false;
    }
  });

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/** Get the working directory of a slate server. */
export const getServerPath = (svc: SlateServer): Effect.Effect<string | null, SlateError> =>
  httpRequest<string | null>("GET", `${svc.baseUrl}/path`);

// ---------------------------------------------------------------------------
// Session operations
// ---------------------------------------------------------------------------

/** List all sessions. */
export const listSessions = (svc: SlateServer, options?: { roots?: boolean; limit?: number }): Effect.Effect<unknown[], SlateError> => {
  const params = new URLSearchParams();
  if (options?.roots) params.set("roots", "true");
  if (options?.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  const url = `${svc.baseUrl}/session${qs ? `?${qs}` : ""}`;
  return httpRequest<unknown[]>("GET", url);
};

/** Create a new session. */
export const createSession = (svc: SlateServer, title?: string): Effect.Effect<{ id: string }, SlateError> =>
  httpRequest<{ id: string }>("POST", `${svc.baseUrl}/session`, { title });

/** Get a session by ID. */
export const getSession = (svc: SlateServer, sessionId: string): Effect.Effect<unknown, SlateError> =>
  httpRequest<unknown>("GET", `${svc.baseUrl}/session/${sessionId}`);

/** Delete a session. */
export const deleteSession = (svc: SlateServer, sessionId: string): Effect.Effect<void, SlateError> =>
  Effect.asVoid(httpRequest<unknown>("DELETE", `${svc.baseUrl}/session/${sessionId}`));

/** Abort a running session. */
export const abortSession = (svc: SlateServer, sessionId: string): Effect.Effect<void, SlateError> =>
  Effect.asVoid(httpRequest<unknown>("POST", `${svc.baseUrl}/session/${sessionId}/abort`));

/** Get session messages. */
export const getSessionMessages = (svc: SlateServer, sessionId: string, limit?: number): Effect.Effect<unknown[], SlateError> => {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  const url = `${svc.baseUrl}/session/${sessionId}/message${qs ? `?${qs}` : ""}`;
  return httpRequest<unknown[]>("GET", url);
};

/** Send a command to a session. */
export const sendCommand = (svc: SlateServer, sessionId: string, command: string, args?: string): Effect.Effect<unknown[], SlateError> =>
  httpRequest<unknown[]>("POST", `${svc.baseUrl}/session/${sessionId}/command`, { command, arguments: args ?? "" });

/** Fork a session. */
export const forkSession = (svc: SlateServer, sessionId: string, messageId?: string): Effect.Effect<unknown, SlateError> =>
  httpRequest<unknown>("POST", `${svc.baseUrl}/session/${sessionId}/fork`, { messageID: messageId });

// ---------------------------------------------------------------------------
// Workflow operations
// ---------------------------------------------------------------------------

/** List workflow runs for a session. */
export const listWorkflowRuns = (svc: SlateServer, sessionId: string): Effect.Effect<unknown[], SlateError> =>
  httpRequest<unknown[]>("GET", `${svc.baseUrl}/workflow-run?sessionID=${sessionId}`);

/** Get a specific workflow run. */
export const getWorkflowRun = (svc: SlateServer, runId: string): Effect.Effect<unknown, SlateError> =>
  httpRequest<unknown>("GET", `${svc.baseUrl}/workflow-run/${runId}`);

/** Cancel a workflow run. */
export const cancelWorkflowRun = (svc: SlateServer, runId: string): Effect.Effect<void, SlateError> =>
  Effect.asVoid(httpRequest<unknown>("POST", `${svc.baseUrl}/workflow-run/${runId}/cancel`));

/** Get the program graph for a run. */
export const getRunProgramGraph = (svc: SlateServer, runId: string): Effect.Effect<unknown, SlateError> =>
  httpRequest<unknown>("GET", `${svc.baseUrl}/workflow-run/${runId}/program-graph`);

// ---------------------------------------------------------------------------
// Permission operations
// ---------------------------------------------------------------------------

/** List pending permission requests. */
export const listPermissions = (svc: SlateServer): Effect.Effect<unknown[], SlateError> =>
  httpRequest<unknown[]>("GET", `${svc.baseUrl}/permission`);

/** Reply to a permission request. */
export const replyToPermission = (svc: SlateServer, requestId: string, action: string, message?: string): Effect.Effect<void, SlateError> =>
  Effect.asVoid(httpRequest<unknown>("POST", `${svc.baseUrl}/permission/${requestId}/reply`, { reply: action, message }));

// ---------------------------------------------------------------------------
// Model operations
// ---------------------------------------------------------------------------

/** List model slots. */
export const listModelSlots = (svc: SlateServer, slotId?: string): Effect.Effect<unknown, SlateError> => {
  const url = slotId ? `${svc.baseUrl}/model/slots/${slotId}` : `${svc.baseUrl}/model/slots`;
  return httpRequest<unknown>("GET", url);
};

/** Set a default model for a slot. */
export const setSlotDefault = (svc: SlateServer, slotId: string, model?: string, variant?: string, providerId?: string): Effect.Effect<void, SlateError> =>
  Effect.asVoid(httpRequest<unknown>("POST", `${svc.baseUrl}/model/slots/${slotId}/default`, { model, variant, providerId }));

/** Set the model for a session. */
export const setSessionModel = (svc: SlateServer, sessionId: string, slot?: string, model?: string, variant?: string, providerId?: string): Effect.Effect<void, SlateError> =>
  Effect.asVoid(httpRequest<unknown>("POST", `${svc.baseUrl}/model/session/${sessionId}/model`, { slot, model, variant, providerId }));

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

/** List files in a directory. */
export const listFiles = (svc: SlateServer, path?: string): Effect.Effect<unknown, SlateError> =>
  httpRequest<unknown>("GET", `${svc.baseUrl}/file`, { path: path ?? "" });

/** Read file content. */
export const readFile = (svc: SlateServer, path: string): Effect.Effect<string, SlateError> =>
  httpRequest<string>("GET", `${svc.baseUrl}/file/content`, { path });

// ---------------------------------------------------------------------------
// Ops operations
// ---------------------------------------------------------------------------

/** Get global config. */
export const getConfig = (svc: SlateServer): Effect.Effect<unknown, SlateError> =>
  httpRequest<unknown>("GET", `${svc.baseUrl}/global/config`);

/** Update global config. */
export const patchConfig = (svc: SlateServer, data: unknown): Effect.Effect<unknown, SlateError> =>
  httpRequest<unknown>("PATCH", `${svc.baseUrl}/global/config`, data);

/** Dispose server. */
export const disposeServer = (svc: SlateServer): Effect.Effect<void, SlateError> =>
  Effect.asVoid(httpRequest<unknown>("POST", `${svc.baseUrl}/global/dispose`));

/** Get VCS info. */
export const getVcs = (svc: SlateServer): Effect.Effect<unknown, SlateError> =>
  httpRequest<unknown>("GET", `${svc.baseUrl}/vcs`);
