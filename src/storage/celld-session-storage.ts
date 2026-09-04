import { Database } from "bun:sqlite";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// celld SQLite storage using bun:sqlite
const CELLD_DIR = path.join(os.homedir(), ".local", "share", "sec", "celld");
const CELLD_DB = path.join(CELLD_DIR, "sessions.db");

let _db: Database | null = null;

function getDb(): Database {
  if (_db) return _db;
  if (!fs.existsSync(CELLD_DIR)) fs.mkdirSync(CELLD_DIR, { recursive: true });
  _db = new Database(CELLD_DB);
  _db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, title TEXT, model TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT,
    data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS runtime_events (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL,
    ts TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS usage (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, ts TEXT NOT NULL,
    input_tokens INTEGER, output_tokens INTEGER, cost REAL, model TEXT);
  CREATE INDEX IF NOT EXISTS idx_events ON runtime_events(session_id);
  CREATE INDEX IF NOT EXISTS idx_usage ON usage(session_id);`);
  return _db;
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function now() { return new Date().toISOString(); }

export interface SessionEntry { id: string; role: string; content: string; ts: string; toolCalls?: any[]; toolResults?: any[]; }
export interface RuntimeEvent { id: string; type: string; ts: string; data: any; }
export interface Session { id: string; title?: string; model: string; created_at: string; updated_at?: string; entries: SessionEntry[]; events: RuntimeEvent[]; }
export interface SessionMeta { id: string; title?: string; model: string; created_at: string; updated_at?: string; eventCount: number; }
export interface Usage { id: string; sessionId: string; ts: string; inputTokens?: number; outputTokens?: number; cost?: number; model?: string; }

export function createSession(title?: string, model?: string): Session {
  const db = getDb();
  const id = "ses_" + genId();
  const ts = now();
  const session: Session = { id, title: title || "New session", model: model || "openrouter/openrouter/free", created_at: ts, entries: [], events: [] };
  db.prepare("INSERT INTO sessions (id, title, model, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)").run(id, session.title, session.model, ts, ts, JSON.stringify({ entries: [], events: [] }));
  return session;
}

export function getSession(id: string): Session | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
  if (!row) return null;
  const data = JSON.parse(row.data);
  return { id: row.id, title: row.title, model: row.model, created_at: row.created_at, updated_at: row.updated_at, entries: data.entries || [], events: data.events || [] };
}

export function updateSession(s: Session): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET title = ?, updated_at = ?, data = ? WHERE id = ?").run(s.title, now(), JSON.stringify({ entries: s.entries, events: s.events }), s.id);
}

export function listSessions(): SessionMeta[] {
  const db = getDb();
  const rows = db.prepare("SELECT s.id, s.title, s.model, s.created_at, s.updated_at, (SELECT COUNT(*) FROM runtime_events WHERE session_id = s.id) as ec FROM sessions s ORDER BY s.updated_at DESC").all() as any[];
  return rows.map(r => ({ id: r.id, title: r.title, model: r.model, created_at: r.created_at, updated_at: r.updated_at, eventCount: r.ec }));
}

export function deleteSession(id: string): boolean {
  const db = getDb();
  const r = db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  return r.changes > 0;
}

export function appendEvent(sessionId: string, event: RuntimeEvent): void {
  const db = getDb();
  db.prepare("INSERT INTO runtime_events (id, session_id, type, ts, data) VALUES (?, ?, ?, ?, ?)").run(event.id, sessionId, event.type, event.ts, JSON.stringify(event.data));
  db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(event.ts, sessionId);
}

export function getEvents(sessionId: string): RuntimeEvent[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM runtime_events WHERE session_id = ? ORDER BY ts ASC").all(sessionId) as any[];
  return rows.map(r => ({ id: r.id, type: r.type, ts: r.ts, data: JSON.parse(r.data) }));
}

export function recordUsage(sessionId: string, usage: Usage): void {
  const db = getDb();
  db.prepare("INSERT INTO usage (id, session_id, ts, input_tokens, output_tokens, cost, model) VALUES (?, ?, ?, ?, ?, ?, ?)").run(usage.id, sessionId, usage.ts, usage.inputTokens ?? null, usage.outputTokens ?? null, usage.cost ?? null, usage.model ?? null);
}

export function getTotalUsage(sessionId: string): { inputTokens: number; outputTokens: number; cost: number } {
  const db = getDb();
  const r = db.prepare("SELECT SUM(input_tokens) as it, SUM(output_tokens) as ot, SUM(cost) as c FROM usage WHERE session_id = ?").get(sessionId) as any;
  return { inputTokens: r.it || 0, outputTokens: r.ot || 0, cost: r.c || 0 };
}
