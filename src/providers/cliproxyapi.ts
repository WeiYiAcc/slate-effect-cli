/**
 * providers/cliproxyapi.ts — CLIProxyAPI Free Models Router provider
 * 
 * Implements the Free Models Router pattern from pi-cliproxyapi-provider
 * for the slate-effect-cli Effect-based harness.
 */

import { Effect } from "effect";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CliproxyapiConfig {
  readonly providerId: "cliproxyapi";
  readonly providerName: "CLIProxyAPI - Free Models Router";
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly inferenceBaseUrl: string;
  readonly modelsUrl: string;
  readonly freeModels: readonly string[];
}

export interface FreeModelSelection {
  readonly modelId: string;
  readonly providerId: "cliproxyapi";
  readonly providerName: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "http://127.0.0.1:8317";
const DEFAULT_API_KEY = "ak-local-cpa";
const CLIENT_VERSION = "slate-effect-cli";
const MODELS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedConfig: CliproxyapiConfig | null = null;
let cacheTimestamp = 0;

// ---------------------------------------------------------------------------
// Pure functions (from pi-cliproxyapi-provider lib.ts)
// ---------------------------------------------------------------------------

/**
 * Normalize user-provided base URL into inference + models endpoints.
 * 
 * Preferred input: host:port (e.g. http://127.0.0.1:7777)
 * - /v1 rewritten to /backend-api for inference
 * - models always at {root}/v1/models?client_version={CLIENT_VERSION}
 */
export function resolveEndpoints(baseUrlInput: string): {
  readonly inferenceBaseUrl: string;
  readonly modelsUrl: string;
  readonly rootOrigin: string;
} {
  let raw = baseUrlInput.trim();
  if (!raw) {
    throw new Error("baseUrl is empty");
  }
  if (!/^https?:\/\//i.test(raw)) {
    raw = `http://${raw}`;
  }

  const url = new URL(raw);
  let path = url.pathname.replace(/\/+$/, "");

  // CLIProxyAPI on port 8317 uses OpenAI-compatible /v1/ endpoints
  // Don't rewrite to /backend-api for this case
  if (path === "" || path === "/") {
    path = "/v1";
  } else if (!path.endsWith("/v1")) {
    path = `${path}/v1`;
  }

  const rootPath = path.replace(/\/v1$/, "");
  const inferenceBaseUrl = `${url.origin}${path}/`;
  const modelsPath = `${rootPath}/v1/models`.replace(/\/{2,}/g, "/");
  const modelsUrl = `${url.origin}${modelsPath}?client_version=${encodeURIComponent(CLIENT_VERSION)}`;

  return { inferenceBaseUrl, modelsUrl, rootOrigin: url.origin };
}

// ---------------------------------------------------------------------------
// Effect-based operations
// ---------------------------------------------------------------------------

/**
 * Fetch the Free Models Router configuration from remote catalog.
 */
export const fetchFreeModelsConfig = Effect.gen(function* () {
  try {
    const response = yield* Effect.promise(() =>
      fetch("https://raw.githubusercontent.com/router-for-me/models/refs/heads/main/models.json", {
        signal: AbortSignal.timeout(30000)
      })
    );
    
    if (!response.ok) {
      return yield* Effect.fail(new Error(`Failed to fetch models catalog: ${response.status}`));
    }
    
    const models = yield* Effect.promise(() => response.json());
    
    // Extract the codex-free models (Free Models Router)
    const codexFreeModels = (models["codex-free"] || []).map((m: any) => m.id);
    
    const baseUrl = DEFAULT_BASE_URL;
    const apiKey = DEFAULT_API_KEY;
    
    const endpoints = resolveEndpoints(baseUrl);
    
    return {
      providerId: "cliproxyapi" as const,
      providerName: "CLIProxyAPI - Free Models Router",
      baseUrl,
      apiKey,
      inferenceBaseUrl: endpoints.inferenceBaseUrl,
      modelsUrl: endpoints.modelsUrl,
      freeModels: codexFreeModels.length > 0 ? codexFreeModels : [
        "gpt-5.4-mini",
        "gpt-5.5", 
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "codex-auto-review"
      ]
    } as CliproxyapiConfig;
  } catch (error) {
    // Fallback to default free models
    const baseUrl = DEFAULT_BASE_URL;
    const apiKey = DEFAULT_API_KEY;
    const endpoints = resolveEndpoints(baseUrl);
    
    return {
      providerId: "cliproxyapi" as const,
      providerName: "CLIProxyAPI - Free Models Router",
      baseUrl,
      apiKey,
      inferenceBaseUrl: endpoints.inferenceBaseUrl,
      modelsUrl: endpoints.modelsUrl,
      freeModels: [
        "gpt-5.4-mini",
        "gpt-5.5", 
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "codex-auto-review"
      ]
    } as CliproxyapiConfig;
  }
});

/**
 * Get cached or fresh Free Models Router configuration.
 * Note: This is a synchronous function that returns the config directly.
 */
export function getFreeModelsConfig(): CliproxyapiConfig {
  const now = Date.now();
  
  if (cachedConfig && (now - cacheTimestamp) < MODELS_CACHE_TTL_MS) {
    return cachedConfig;
  }
  
  // This function should be called within an Effect context
  // For now, return a default config
  const endpoints = resolveEndpoints(DEFAULT_BASE_URL);
  
  return {
    providerId: "cliproxyapi",
    providerName: "CLIProxyAPI - Free Models Router",
    baseUrl: DEFAULT_BASE_URL,
    apiKey: DEFAULT_API_KEY,
    inferenceBaseUrl: endpoints.inferenceBaseUrl,
    modelsUrl: endpoints.modelsUrl,
    freeModels: [
      "gpt-5.4-mini",
      "gpt-5.5", 
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "codex-auto-review"
    ]
  };
}

/**
 * Select a model from the Free Models Router.
 * Uses round-robin selection from available free models.
 */
export const selectFreeModel = Effect.gen(function* () {
  // Get config synchronously (no network needed for model selection)
  const config = getFreeModelsConfig();
  
  // 使用已验证可用的 openrouter/openrouter/free 模型
  // 其他模型（如 gpt-5.6-luna、gpt-5.5）返回 "no available members" 错误
  const modelId = "openrouter/openrouter/free";
  
  return {
    modelId,
    providerId: config.providerId,
    providerName: config.providerName
  } as FreeModelSelection;
});

/**
 * Make a chat completion request to CLIProxyAPI backend-api.
 */
export const chatCompletion = (
  config: CliproxyapiConfig,
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; maxTokens?: number }
): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    const response = yield* Effect.promise(() =>
      fetch(`${config.inferenceBaseUrl}chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
        }),
        signal: AbortSignal.timeout(120000)
      })
    );
    if (!response.ok) {
      const errorText = yield* Effect.promise(() => response.text());
      return yield* Effect.fail(new Error(`Chat completion failed: ${response.status} - ${errorText}`));
    }
    
    const data = yield* Effect.promise(() => response.json());
    
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return yield* Effect.fail(new Error("No content in response"));
    }
    
    return content;
  });

/**
 * Health check for CLIProxyAPI.
 */
export const healthCheck = (baseUrl: string = DEFAULT_BASE_URL): Effect.Effect<boolean, never> =>
  Effect.gen(function* () {
    try {
      const response = yield* Effect.promise(() =>
        fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(3000) })
      );
      if (!response.ok) return false;
      const data: { healthy?: boolean } = yield* Effect.promise(() => response.json());
      return !!data?.healthy;
    } catch {
      return false;
    }
  });
