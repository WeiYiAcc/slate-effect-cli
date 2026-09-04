import { Effect, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import * as fs from "fs"
import { join } from "path"
import { spawn } from "child_process"

// ---------------------------------------------------------------------------
// Schema 定义
// ---------------------------------------------------------------------------

export class ReadParams extends Schema.Class<ReadParams>("ReadParams")({
  path: Schema.String,
  offset: Schema.Int.check(Schema.isNonNegative).pipe(Schema.optional),
  limit: Schema.Int.check(Schema.isPositive).pipe(Schema.optional),
}) {}

export class ReadSuccess extends Schema.Class<ReadSuccess>("ReadSuccess")({
  content: Schema.String,
}) {}

export class ReadError extends Schema.TaggedError<ReadError>()("ReadError", {
  message: Schema.String,
}) {}

export class BashParams extends Schema.Class<BashParams>("BashParams")({
  command: Schema.String,
  cwd: Schema.String.pipe(Schema.optional),
}) {}

export class BashSuccess extends Schema.Class<BashSuccess>("BashSuccess")({
  stdout: Schema.String,
  stderr: Schema.String,
  exitCode: Schema.Int,
}) {}

export class BashError extends Schema.TaggedError<BashError>()("BashError", {
  message: Schema.String,
}) {}

export class EditParams extends Schema.Class<EditParams>("EditParams")({
  path: Schema.String,
  old: Schema.String,
  newContent: Schema.String,
}) {}

export class EditSuccess extends Schema.Class<EditSuccess>("EditSuccess")({
  path: Schema.String,
}) {}

export class EditError extends Schema.TaggedError<EditError>()("EditError", {
  message: Schema.String,
}) {}

export class WebSearchParams extends Schema.Class<WebSearchParams>("WebSearchParams")({
  query: Schema.String,
}) {}

export class WebSearchSuccess extends Schema.Class<WebSearchSuccess>("WebSearchSuccess")({
  results: Schema.Array(Schema.Any),
}) {}

export class WebSearchError extends Schema.TaggedError<WebSearchError>()("WebSearchError", {
  message: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// Tool 定义 (使用 effect/unstable/ai)
// ---------------------------------------------------------------------------

export const ReadTool = Tool.make("read", {
  description: "Read file contents",
  parameters: ReadParams,
  success: ReadSuccess,
  failure: ReadError,
  failureMode: "error",
})

export const BashTool = Tool.make("bash", {
  description: "Execute bash command",
  parameters: BashParams,
  success: BashSuccess,
  failure: BashError,
  failureMode: "error",
})

export const EditTool = Tool.make("edit", {
  description: "Edit file: search for old string and replace with new string",
  parameters: EditParams,
  success: EditSuccess,
  failure: EditError,
  failureMode: "error",
})

export const WebSearchTool = Tool.make("websearch", {
  description: "Search the web using DuckDuckGo",
  parameters: WebSearchParams,
  success: WebSearchSuccess,
  failure: WebSearchError,
  failureMode: "error",
})

// ---------------------------------------------------------------------------
// Toolkit 组合
// ---------------------------------------------------------------------------

export const EffectToolkit = Toolkit.make(ReadTool, BashTool, EditTool, WebSearchTool)

// ---------------------------------------------------------------------------
// Layer (工具实现)
// ---------------------------------------------------------------------------

export const EffectToolkitLayer = EffectToolkit.toLayer({
  read: ({ path: filePath, offset, limit }) =>
    Effect.gen(function* () {
      try {
        const resolved = join(filePath)
        const content = fs.readFileSync(resolved, "utf-8")
        const lines = content.split("\n")
        const start = offset ?? 0
        const end = limit ? start + limit : lines.length
        return {
          content: lines.slice(start, end).join("\n"),
        }
      } catch (e) {
        return yield* Effect.fail(new ReadError({
          message: e instanceof Error ? e.message : String(e),
        }))
      }
    }),

  bash: ({ command, cwd }) =>
    Effect.promise(() =>
      new Promise((resolve) => {
        const proc = spawn("bash", ["-c", command], {
          cwd: cwd ?? process.cwd(),
        })
        let stdout = ""
        let stderr = ""
        proc.stdout?.on("data", (d) => { stdout += d.toString() })
        proc.stderr?.on("data", (d) => { stderr += d.toString() })
        proc.on("close", (code) => {
          resolve({ stdout, stderr, exitCode: code ?? 0 })
        })
        proc.on("error", (e) => {
          resolve({ stdout: "", stderr: e.message, exitCode: 1 })
        })
      })
    ),

  edit: ({ path: filePath, old, newContent }) =>
    Effect.gen(function* () {
      try {
        const resolved = join(filePath)
        const content = fs.readFileSync(resolved, "utf-8")
        const idx = content.indexOf(old)
        if (idx === -1) {
          return yield* Effect.fail(new EditError({
            message: `Old content not found in ${filePath}`
          }))
        }
        const updated = content.slice(0, idx) + newContent + content.slice(idx + old.length)
        fs.writeFileSync(resolved, updated, "utf-8")
        return { path: filePath }
      } catch (e) {
        return yield* Effect.fail(new EditError({
          message: e instanceof Error ? e.message : String(e),
        }))
      }
    }),

  websearch: ({ query }) =>
    Effect.promise(() =>
      (async () => {
        try {
          const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`
          const resp = await fetch(url)
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const data = await resp.json()
          return {
            results: (data.results ?? []).slice(0, 10).map((r) => ({
              text: r.text ?? "",
              url: r.URL ?? "",
            })),
          }
        } catch (e) {
          throw new WebSearchError({
            message: e instanceof Error ? e.message : String(e),
          })
        }
      })()
    ),
})

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
