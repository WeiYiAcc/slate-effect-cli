/**
 * Core types for slate-effect-cli.
 *
 * Every concept from the original slate is represented as an Effect-native
 * type so that the CLI can be built as a pure Effect program.
 */
import type { Schema, Effect, Layer, Ref, Scope, Stream, Exit } from "effect";
import type { AgentId, AgentRuntime, AgentPolicy } from "@effect-agent/core";
import type { Toolkit } from "@effect-agent/core/toolkit";

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Unique identifier for a slate session. */
export type SessionId = string & { readonly __brand: unique symbol };

/** Unique identifier for a workflow run. */
export type RunId = string & { readonly __brand: unique symbol };

/** Unique identifier for a permission request. */
export type PermissionRequestId = string & { readonly __brand: unique symbol };

/** Unique identifier for a file path within a workspace. */
export type FilePath = string & { readonly __brand: unique symbol };

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** A slate session that groups related runs. */
export interface Session {
  readonly id: SessionId;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly parentId: SessionId | undefined;
  readonly rootSessionId: SessionId | undefined;
  readonly externalWorkspaces: string[];
}

// ---------------------------------------------------------------------------
// Workflow run
// ---------------------------------------------------------------------------

/** Status of a workflow run. */
export type RunStatus = "running" | "completed" | "completed-quiet" | "failed" | "cancelled" | "timeout";

/** A single workflow run produced by a goal. */
export interface WorkflowRun {
  readonly id: RunId;
  readonly sessionId: SessionId;
  readonly kind: string;
  readonly status: RunStatus;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Goal / Objective
// ---------------------------------------------------------------------------

/** Input to a goal execution. */
export interface GoalInput {
  readonly objective: string;
  readonly timeout?: number;
  readonly dir?: string;
  readonly json?: boolean;
  readonly wait?: boolean;
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

/** A permission request that may need approval before execution. */
export interface PermissionRequest {
  readonly id: PermissionRequestId;
  readonly sessionId: SessionId;
  readonly action: string;
  readonly details: unknown;
  readonly status: "pending" | "approved" | "rejected";
}

// ---------------------------------------------------------------------------
// Model slot
// ---------------------------------------------------------------------------

/** A model slot that can be assigned to a session or globally. */
export interface ModelSlot {
  readonly id: string;
  readonly model: string;
  readonly variant?: string;
  readonly providerId?: string;
  readonly isDefault: boolean;
  readonly isFavorite: boolean;
}

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

/** File listing entry. */
export interface FileEntry {
  readonly path: FilePath;
  readonly name: string;
  readonly size: number;
  readonly modifiedAt: Date;
  readonly isDirectory: boolean;
}

// ---------------------------------------------------------------------------
// Agent Definition (for the slate goal engine)
// ---------------------------------------------------------------------------

/** Slates' core agent definition that implements the planner → worker → verifier loop. */
export interface SlateAgentDefinition {
  readonly id: AgentId;
  readonly instructions: string;
  readonly toolkit: Toolkit.Any;
  readonly policy: AgentPolicy;
}
