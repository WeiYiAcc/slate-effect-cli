/**
 * slate-tools.ts — Effect-native tool declarations for the slate CLI.
 *
 * Each function corresponds to a tool that the agent loop can invoke.
 * Tools are declared as Effect-aware functions that compose with
 * Effect Agent's toolkit system.
 */
import { Effect, Layer, Context } from "effect";
import type { SessionId, RunId, PermissionRequestId } from "../types/index.ts";
import { SlateService, SlateError } from "../runtime/slate-service.ts";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** List all sessions. */
export function listSessions(params: { roots?: boolean; limit?: number }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    // In the real implementation, call svc.listSessions(params)
    return yield* Effect.promise(() => fetch(`${svc.baseUrl}/session`, {
      headers: { "content-type": "application/json" },
    }).then(r => r.text()));
  });
}

/** Get a session by ID. */
export function getSession(params: { id: SessionId }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    return yield* Effect.promise(() => fetch(`${svc.baseUrl}/session/${params.id}`, {
      headers: { "content-type": "application/json" },
    }).then(r => r.text()));
  });
}

/** Create a new session. */
export function createSession(params: { title?: string }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: params.title }),
    }));
    return res.text();
  });
}

/** Delete a session. */
export function deleteSession(params: { id: SessionId }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/session/${params.id}`, { method: "DELETE" }));
    return res.text();
  });
}

/** Send a command to a session. */
export function sendCommand(params: { sessionId: SessionId; command: string; args?: string }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/session/${params.sessionId}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: params.command, arguments: params.args ?? "" }),
    }));
    return res.text();
  });
}

/** List workflow runs for a session. */
export function listWorkflowRuns(params: { sessionId: SessionId }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/workflow-run?sessionID=${params.sessionId}`, {
      headers: { "content-type": "application/json" },
    }));
    return res.text();
  });
}

/** Cancel a workflow run. */
export function cancelWorkflowRun(params: { runId: RunId }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/workflow-run/${params.runId}/cancel`, { method: "POST" }));
    return res.text();
  });
}

/** Get the program graph for a run. */
export function getRunGraph(params: { runId: RunId }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/workflow-run/${params.runId}/program-graph`, {
      headers: { "content-type": "application/json" },
    }));
    return res.text();
  });
}

/** List pending permission requests. */
export function listPermissions(): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/permission`, {
      headers: { "content-type": "application/json" },
    }));
    return res.text();
  });
}

/** Reply to a permission request. */
export function replyToPermission(params: { requestId: PermissionRequestId; action: string; message?: string }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/permission/${params.requestId}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply: params.action, message: params.message }),
    }));
    return res.text();
  });
}

/** List model slots. */
export function listModelSlots(): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/model/slots`, {
      headers: { "content-type": "application/json" },
    }));
    return res.text();
  });
}

/** Set a default model for a slot. */
export function setSlotDefault(params: { slotId: string; model?: string; variant?: string; providerId?: string }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/model/slots/${params.slotId}/default`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: params.model, variant: params.variant, providerId: params.providerId }),
    }));
    return res.text();
  });
}

/** List files in a directory. */
export function listFiles(params: { path?: string }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/file?path=${params.path ?? ""}`, {
      headers: { "content-type": "application/json" },
    }));
    return res.text();
  });
}

/** Read file content. */
export function readFile(params: { path: string }): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/file/content?path=${params.path}`, {
      headers: { "content-type": "application/json" },
    }));
    return res.text();
  });
}

/** Watch events via SSE. */
export function watchEvents(params: { types?: string[]; global?: boolean }): Effect.Effect<{ text: string; done: boolean }[], SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const endpoint = params.global ? "/global/event" : "/event";
    const url = new URL(`${svc.baseUrl}${endpoint}`);
    if (params.types) url.searchParams.set("types", params.types.join(","));
    if (params.global) url.searchParams.set("global", "true");

    const res = yield* Effect.promise(() => fetch(url.toString(), { headers: { accept: "text/event-stream" } }));
    if (!res.ok || !res.body) throw new SlateError(`SSE connect failed: HTTP ${res.status}`);

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    const events: { text: string; done: boolean }[] = [];

    for (;;) {
      const { done, value } = yield* Effect.promise(() => reader.read());
      if (done) break;
      const line = dec.decode(value, { stream: true });
      if (line.trim()) {
        events.push({ text: line, done: false });
      }
    }
    return events;
  });
}

/** Get server health. */
export function getHealth(baseUrl: string): Effect.Effect<boolean, SlateError> {
  return Effect.gen(function* () {
    try {
      const res = yield* Effect.promise(() => fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(1500) }));
      if (!res.ok) return false;
      const j = yield* Effect.promise(() => res.json()) as { healthy?: boolean };
      return !!j?.healthy;
    } catch {
      return false;
    }
  });
}

/** Get the server path. */
export function getPath(): Effect.Effect<string, SlateError> {
  return Effect.gen(function* () {
    const svc = yield* SlateService;
    const res = yield* Effect.promise(() => fetch(`${svc.baseUrl}/path`, {
      headers: { "content-type": "application/json" },
    }));
    return res.text();
  });
}

// ---------------------------------------------------------------------------
// Toolkit composition
// ---------------------------------------------------------------------------

import { Effect, Layer } from "effect";
import { Toolkit } from "@effect-agent/core";

/** A toolkit that bundles all slate tools together. */
export function makeSlateToolkit(): Layer.Layer<Toolkit.Any> {
  return Layer.mergeAll(
    Layer.effect(
      "slate:listSessions",
      Effect.gen(function* () { return listSessions; }),
    ),
    Layer.effect(
      "slate:getSession",
      Effect.gen(function* () { return getSession; }),
    ),
    Layer.effect(
      "slate:createSession",
      Effect.gen(function* () { return createSession; }),
    ),
    Layer.effect(
      "slate:deleteSession",
      Effect.gen(function* () { return deleteSession; }),
    ),
    Layer.effect(
      "slate:sendCommand",
      Effect.gen(function* () { return sendCommand; }),
    ),
    Layer.effect(
      "slate:listWorkflowRuns",
      Effect.gen(function* () { return listWorkflowRuns; }),
    ),
    Layer.effect(
      "slate:cancelWorkflowRun",
      Effect.gen(function* () { return cancelWorkflowRun; }),
    ),
    Layer.effect(
      "slate:getRunGraph",
      Effect.gen(function* () { return getRunGraph; }),
    ),
    Layer.effect(
      "slate:listPermissions",
      Effect.gen(function* () { return listPermissions; }),
    ),
    Layer.effect(
      "slate:replyToPermission",
      Effect.gen(function* () { return replyToPermission; }),
    ),
    Layer.effect(
      "slate:listModelSlots",
      Effect.gen(function* () { return listModelSlots; }),
    ),
    Layer.effect(
      "slate:setSlotDefault",
      Effect.gen(function* () { return setSlotDefault; }),
    ),
    Layer.effect(
      "slate:listFiles",
      Effect.gen(function* () { return listFiles; }),
    ),
    Layer.effect(
      "slate:readFile",
      Effect.gen(function* () { return readFile; }),
    ),
    Layer.effect(
      "slate:watchEvents",
      Effect.gen(function* () { return watchEvents; }),
    ),
    Layer.effect(
      "slate:getHealth",
      Effect.gen(function* () { return getHealth; }),
    ),
    Layer.effect(
      "slate:getPath",
      Effect.gen(function* () { return getPath; }),
    ),
  );
}
