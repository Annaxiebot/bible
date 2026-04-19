/**
 * ai-chat Edge Function
 *
 * Proxies AI chat requests to the user's configured provider.
 * Supports single-provider mode and race mode (fastest of N providers).
 *
 * POST /ai-chat
 * Body: { prompt, history, options: { model?, autoRace?, ... } }
 * Auth: Bearer token (Supabase JWT)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Provider API endpoints
const PROVIDER_ENDPOINTS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  claude: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
  openai: "https://api.openai.com/v1/chat/completions",
  kimi: "https://api.moonshot.cn/v1/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  minimax: "https://api.minimax.io/v1/chat/completions",
  zhipu: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  zai: "https://api.z.ai/api/anthropic/v1/messages",
  r9s: "https://api.r9s.ai/v1/chat/completions",
  moonshot: "https://api.moonshot.ai/v1/chat/completions",
};

const ANTHROPIC_PROTOCOL_PROVIDERS = new Set(["claude", "zai"]);

const PROVIDER_KEY_NAMES: Record<string, string> = {
  openrouter: "openrouter_api_key", claude: "claude_api_key",
  gemini: "gemini_api_key", openai: "openai_api_key",
  kimi: "kimi_api_key", nvidia: "nvidia_api_key",
  deepseek: "deepseek_api_key", groq: "groq_api_key",
  dashscope: "dashscope_api_key", minimax: "minimax_api_key",
  zhipu: "zhipu_api_key", zai: "zai_api_key",
  r9s: "r9s_api_key", moonshot: "moonshot_api_key",
};

const DEFAULT_MODELS: Record<string, string> = {
  openrouter: "openrouter/auto", claude: "claude-sonnet-4-6",
  gemini: "gemini-3-flash-preview", openai: "gpt-4o-mini",
  kimi: "moonshot-v1-128k", nvidia: "meta/llama-3.1-8b-instruct",
  deepseek: "deepseek-chat", groq: "llama-3.3-70b-versatile",
  dashscope: "qwen3.5-flash", minimax: "MiniMax-M2.5",
  zhipu: "glm-4-plus", zai: "glm-5",
  r9s: "claude-sonnet-4-6", moonshot: "kimi-k2.5",
};

// All available models per provider (for race mode)
const ALL_MODELS: Record<string, string[]> = {
  openrouter: ["openrouter/auto"],
  claude: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"],
  gemini: ["gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-flash-lite-latest"],
  openai: ["gpt-4o", "gpt-4o-mini"],
  kimi: ["moonshot-v1-128k"],
  nvidia: ["nvidia/llama-3.1-nemotron-ultra-253b-v1", "nvidia/llama-3.3-nemotron-super-49b-v1", "meta/llama-3.1-8b-instruct"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  dashscope: ["qwen3.5-max", "qwen3.5-plus", "qwen3.5-flash"],
  minimax: ["MiniMax-M2.5", "MiniMax-M2.5-highspeed"],
  zhipu: ["glm-5", "glm-4-plus", "glm-4-air"],
  zai: ["glm-5", "glm-4.7"],
  r9s: ["claude-sonnet-4-6", "claude-haiku-4-5"],
  moonshot: ["kimi-k2.5", "kimi-k2-thinking-turbo"],
};

// Models that support vision/image input
const VISION_MODELS = new Set([
  // OpenRouter auto handles vision routing
  "openrouter/auto",
  // Claude - all support vision
  "claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6",
  // Gemini - all support vision
  "gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-flash-lite-latest",
  // OpenAI - gpt-4o supports vision
  "gpt-4o", "gpt-4o-mini",
  // Qwen - vision models
  "qwen3.5-max", "qwen3.5-plus",
  // GLM - vision models
  "glm-5", "glm-4-plus",
  // NVIDIA - nemotron ultra supports vision
  "nvidia/llama-3.1-nemotron-ultra-253b-v1",
]);

const PROVIDER_NAMES: Record<string, string> = {
  openrouter: "OpenRouter", claude: "Claude", gemini: "Gemini",
  openai: "OpenAI", kimi: "Kimi", nvidia: "NVIDIA",
  deepseek: "DeepSeek", groq: "Groq", dashscope: "DashScope/Qwen",
  minimax: "MiniMax", zhipu: "Zhipu/GLM", zai: "Z.AI",
  r9s: "R9S.AI", moonshot: "Moonshot/Kimi",
};

// ── Single provider call ──────────────────────────────────────────

interface CallResult {
  text: string;
  model: string;
  provider: string;
  responseMs: number;
}

async function callSingleProvider(
  providerName: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: any }[],
  prompt: string,
  image?: { data: string; mimeType: string },
): Promise<CallResult> {
  const startTime = Date.now();

  // Separate the system prompt from user/assistant messages — Claude and Gemini
  // require the system instruction in a dedicated field, not as a message role.
  const systemMessage = messages.find(m => m.role === "system");
  const systemText = systemMessage && typeof systemMessage.content === "string" ? systemMessage.content : "";
  const nonSystemMessages = messages.filter(m => m.role !== "system");

  if (providerName === "gemini") {
    const geminiModel = model || "gemini-3-flash-preview";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
    // Gemini image format: inlineData in parts
    const parts: any[] = [{ text: typeof nonSystemMessages[nonSystemMessages.length - 1]?.content === "string" ? nonSystemMessages[nonSystemMessages.length - 1].content : prompt }];
    if (image) {
      const rawBase64 = image.data.includes(",") ? image.data.split(",")[1] : image.data;
      const mimeType = image.mimeType || (image.data.match(/^data:([^;]+);/)?.[1] ?? "image/jpeg");
      parts.push({ inlineData: { mimeType, data: rawBase64 } });
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        contents: nonSystemMessages.map((m, i) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: i === nonSystemMessages.length - 1 ? parts : [{ text: typeof m.content === "string" ? m.content : prompt }],
        })),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Gemini API error");
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { text, model: geminiModel, provider: "Gemini", responseMs: Date.now() - startTime };

  } else if (ANTHROPIC_PROTOCOL_PROVIDERS.has(providerName)) {
    // Claude/Anthropic image format: type "image" with source (raw base64, no data URL prefix)
    const anthropicMessages = nonSystemMessages.map((m, i) => {
      if (i === nonSystemMessages.length - 1 && image) {
        // Strip data URL prefix if present: "data:image/jpeg;base64,..." → raw base64
        const rawBase64 = image.data.includes(",") ? image.data.split(",")[1] : image.data;
        const mimeType = image.mimeType || (image.data.match(/^data:([^;]+);/)?.[1] ?? "image/jpeg");
        return {
          role: m.role,
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: rawBase64 } },
            { type: "text", text: typeof m.content === "string" ? m.content : prompt },
          ],
        };
      }
      return m;
    });
    const endpoint = PROVIDER_ENDPOINTS[providerName];
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 4096, messages: anthropicMessages, ...(systemText ? { system: systemText } : {}) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `${providerName} API error`);
    const text = data.content?.[0]?.text || "";
    return { text, model, provider: PROVIDER_NAMES[providerName] || providerName, responseMs: Date.now() - startTime };

  } else {
    // OpenAI-compatible format with image_url
    const endpoint = PROVIDER_ENDPOINTS[providerName] || PROVIDER_ENDPOINTS.openrouter;
    let finalModel = model;
    if (providerName === "openrouter") {
      if (!model || model === "openrouter/auto:free") finalModel = "openrouter/auto";
    }
    const openaiMessages = image ? messages.map((m, i) => {
      if (i === messages.length - 1) {
        // Ensure we have a proper data URL — strip prefix if already present to avoid doubling
        const rawBase64 = image.data.includes(",") ? image.data.split(",")[1] : image.data;
        const mimeType = image.mimeType || (image.data.match(/^data:([^;]+);/)?.[1] ?? "image/jpeg");
        return {
          role: m.role,
          content: [
            { type: "text", text: typeof m.content === "string" ? m.content : prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${rawBase64}` } },
          ],
        };
      }
      return m;
    }) : messages;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(providerName === "openrouter" ? { "HTTP-Referer": "https://bible.annaxie.com" } : {}),
      },
      body: JSON.stringify({ model: finalModel, messages: openaiMessages, max_tokens: 4096, temperature: 0.7 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `${providerName} API error`);
    const text = data.choices?.[0]?.message?.content || "";
    const usedModel = data.model || finalModel;
    return { text, model: usedModel, provider: PROVIDER_NAMES[providerName] || providerName, responseMs: Date.now() - startTime };
  }
}

// ── Quality check ─────────────────────────────────────────────────

function isQualityResponse(text: string, prompt: string): boolean {
  if (!text || text.length < 50) return false;
  // Check it's not just an error message
  if (text.startsWith("Error:") || text.startsWith("I'm sorry, I")) return false;
  // Check for language match: if prompt has Chinese, response should too
  const hasChinese = /[\u4e00-\u9fff]/.test(prompt);
  if (hasChinese && !/[\u4e00-\u9fff]/.test(text)) return false;
  // Check response doesn't end mid-sentence (truncated)
  if (text.length > 200 && !text.trim().match(/[.!?。！？\n]$/)) return false;
  return true;
}

// ── Race mode ─────────────────────────────────────────────────────

interface RaceResult {
  winner: CallResult;
  raceDetails: { provider: string; model: string; responseMs: number | null; status: string }[];
}

async function raceProviders(
  providers: { name: string; apiKey: string; model: string }[],
  messages: { role: string; content: any }[],
  prompt: string,
  supabase: any,
  userId: string,
  image?: { data: string; mimeType: string },
): Promise<RaceResult> {
  const maxRace = Math.min(providers.length, 5);
  const racers = providers.slice(0, maxRace);

  // Track all results for reporting
  const raceDetails: { provider: string; model: string; responseMs: number | null; status: string }[] =
    racers.map(r => ({ provider: PROVIDER_NAMES[r.name] || r.name, model: r.model, responseMs: null, status: "racing" }));

  const racePromises = racers.map(async (p, i) => {
    try {
      const result = await callSingleProvider(p.name, p.apiKey, p.model, messages, prompt, image);
      raceDetails[i].responseMs = result.responseMs;

      // Save timing to provider_health (fire and forget)
      supabase.from("provider_health").upsert({
        user_id: userId, provider: p.name, model: p.model,
        status: "ok", response_ms: result.responseMs,
        response_length: result.text.length,
        tested_at: new Date().toISOString(), error_message: null,
      }, { onConflict: "user_id,provider,model" }).then(() => {}).catch(() => {});

      if (!isQualityResponse(result.text, prompt)) {
        raceDetails[i].status = "low_quality";
        throw new Error(`Low quality response from ${p.name}`);
      }

      raceDetails[i].status = "ok";
      return { ...result, index: i };
    } catch (error) {
      if (raceDetails[i].status === "racing") raceDetails[i].status = "error";

      supabase.from("provider_health").upsert({
        user_id: userId, provider: p.name, model: p.model,
        status: "error", response_ms: 0, response_length: 0,
        tested_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Unknown error",
      }, { onConflict: "user_id,provider,model" }).then(() => {}).catch(() => {});

      throw error;
    }
  });

  let lastError: Error | null = null;

  const winner = await new Promise<CallResult>((resolve, reject) => {
    let resolved = false;
    let failCount = 0;

    racePromises.forEach((p) => {
      p.then((result) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      }).catch((err) => {
        failCount++;
        lastError = err;
        if (failCount === racers.length) {
          reject(lastError || new Error("All providers failed"));
        }
      });
    });
  });

  return { winner, raceDetails };
}

// ── Streaming race mode ──────────────────────────────────────────
// Race with streaming: first provider to emit a token wins, then stream that response.

interface StreamRacer {
  name: string;
  apiKey: string;
  model: string;
  providerLabel: string;
}

async function raceStreaming(
  racers: StreamRacer[],
  messages: { role: string; content: any }[],
  prompt: string,
  supabase: any,
  userId: string,
): Promise<{ winnerStream: ReadableStream; winnerModel: string; winnerProvider: string; raceDetails: any[] }> {
  const startTimes = racers.map(() => Date.now());
  const raceDetails = racers.map(r => ({ provider: r.providerLabel, model: r.model, responseMs: null as number | null, status: "racing" }));

  // Open streaming connections to all racers
  const abortControllers = racers.map(() => new AbortController());

  const streamPromises = racers.map(async (r, i) => {
    try {
      const endpoint = ANTHROPIC_PROTOCOL_PROVIDERS.has(r.name)
        ? PROVIDER_ENDPOINTS[r.name]
        : (PROVIDER_ENDPOINTS[r.name] || PROVIDER_ENDPOINTS.openrouter);

      let response: Response;

      // Separate the system prompt for providers that need it in a dedicated field
      const raceSystemMessage = messages.find(m => m.role === "system");
      const raceSystemText = raceSystemMessage && typeof raceSystemMessage.content === "string" ? raceSystemMessage.content : "";
      const raceNonSystem = messages.filter(m => m.role !== "system");

      if (r.name === "gemini") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${r.model}:streamGenerateContent?alt=sse&key=${r.apiKey}`;
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortControllers[i].signal,
          body: JSON.stringify({
            ...(raceSystemText ? { systemInstruction: { parts: [{ text: raceSystemText }] } } : {}),
            contents: raceNonSystem.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: typeof m.content === "string" ? m.content : prompt }],
            })),
          }),
        });
      } else if (ANTHROPIC_PROTOCOL_PROVIDERS.has(r.name)) {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": r.apiKey, "anthropic-version": "2023-06-01" },
          signal: abortControllers[i].signal,
          body: JSON.stringify({ model: r.model, max_tokens: 4096, messages: raceNonSystem, stream: true, ...(raceSystemText ? { system: raceSystemText } : {}) }),
        });
      } else {
        let finalModel = r.model;
        if (r.name === "openrouter" && (!r.model || r.model === "openrouter/auto:free")) finalModel = "openrouter/auto";
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${r.apiKey}`,
            ...(r.name === "openrouter" ? { "HTTP-Referer": "https://bible.annaxie.com" } : {}),
          },
          signal: abortControllers[i].signal,
          body: JSON.stringify({ model: finalModel, messages, max_tokens: 4096, temperature: 0.7, stream: true }),
        });
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as any).error?.message || `${r.name} error ${response.status}`);
      }

      // Wait for the first actual data chunk (first token), not just HTTP headers
      const reader = response.body!.getReader();
      const firstRead = await reader.read();
      if (firstRead.done) throw new Error(`${r.name} returned empty stream`);

      raceDetails[i].responseMs = Date.now() - startTimes[i];

      // Reconstruct the stream with the first chunk prepended
      const remainingStream = new ReadableStream({
        start(controller) {
          // Push the first chunk we already read
          controller.enqueue(firstRead.value);
          function pump(): Promise<void> {
            return reader.read().then(({ done, value }) => {
              if (done) { controller.close(); return; }
              controller.enqueue(value);
              return pump();
            });
          }
          pump();
        },
      });

      return { index: i, stream: remainingStream };
    } catch (error) {
      raceDetails[i].status = "error";
      raceDetails[i].responseMs = Date.now() - startTimes[i];
      supabase.from("provider_health").upsert({
        user_id: userId, provider: r.name, model: r.model,
        status: "error", response_ms: 0, response_length: 0,
        tested_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Unknown error",
      }, { onConflict: "user_id,provider,model" }).then(() => {}).catch(() => {});
      throw error;
    }
  });

  // First provider to emit a content token wins
  const winner = await new Promise<{ index: number; stream: ReadableStream }>((resolve, reject) => {
    let resolved = false;
    let failCount = 0;

    streamPromises.forEach((p) => {
      p.then((result) => {
        if (!resolved) {
          resolved = true;
          // Abort all other racers
          abortControllers.forEach((ac, j) => { if (j !== result.index) try { ac.abort(); } catch {} });
          raceDetails[result.index].status = "ok";
          resolve(result);
        }
      }).catch(() => {
        failCount++;
        if (failCount === racers.length) reject(new Error("All streaming providers failed"));
      });
    });
  });

  // Mark losers
  raceDetails.forEach((d, i) => { if (i !== winner.index && d.status === "racing") d.status = "..."; });

  // Save winner timing to health
  const w = racers[winner.index];
  supabase.from("provider_health").upsert({
    user_id: userId, provider: w.name, model: w.model,
    status: "ok", response_ms: raceDetails[winner.index].responseMs || 0,
    response_length: 0, tested_at: new Date().toISOString(), error_message: null,
  }, { onConflict: "user_id,provider,model" }).then(() => {}).catch(() => {});

  return {
    winnerStream: winner.stream,
    winnerModel: racers[winner.index].model,
    winnerProvider: racers[winner.index].providerLabel,
    raceDetails,
  };
}

// ── Settings cache (per-user, 60s TTL) ───────────────────────────

const settingsCache = new Map<string, { settings: Record<string, string>; ts: number }>();
const CACHE_TTL = 60_000; // 60 seconds

function getCachedSettings(userId: string): Record<string, string> | null {
  const entry = settingsCache.get(userId);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.settings;
  return null;
}

function setCachedSettings(userId: string, settings: Record<string, string>) {
  settingsCache.set(userId, { settings, ts: Date.now() });
  // Evict old entries to prevent memory leak (keep max 100 users)
  if (settingsCache.size > 100) {
    const oldest = [...settingsCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) settingsCache.delete(oldest[0]);
  }
}

// ── Streaming helper ─────────────────────────────────────────────

async function streamProvider(
  providerName: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: any }[],
  prompt: string,
): Promise<{ stream: ReadableStream; model: string; provider: string }> {
  const startTime = Date.now();

  // Separate the system prompt for providers that need it in a dedicated field
  const streamSystemMessage = messages.find(m => m.role === "system");
  const streamSystemText = streamSystemMessage && typeof streamSystemMessage.content === "string" ? streamSystemMessage.content : "";
  const streamNonSystem = messages.filter(m => m.role !== "system");

  if (providerName === "gemini") {
    const geminiModel = model || "gemini-3-flash-preview";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(streamSystemText ? { systemInstruction: { parts: [{ text: streamSystemText }] } } : {}),
        contents: streamNonSystem.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: typeof m.content === "string" ? m.content : prompt }],
        })),
      }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error?.message || "Gemini streaming error");
    }
    return {
      stream: response.body!,
      model: geminiModel,
      provider: "Gemini",
    };
  }

  // OpenAI-compatible streaming (OpenRouter, NVIDIA, DeepSeek, Groq, etc.)
  const endpoint = ANTHROPIC_PROTOCOL_PROVIDERS.has(providerName)
    ? PROVIDER_ENDPOINTS[providerName]
    : (PROVIDER_ENDPOINTS[providerName] || PROVIDER_ENDPOINTS.openrouter);

  if (ANTHROPIC_PROTOCOL_PROVIDERS.has(providerName)) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 4096, messages: streamNonSystem, stream: true, ...(streamSystemText ? { system: streamSystemText } : {}) }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error?.message || `${providerName} streaming error`);
    }
    return { stream: response.body!, model, provider: PROVIDER_NAMES[providerName] || providerName };
  }

  // OpenAI-compatible
  let finalModel = model;
  if (providerName === "openrouter" && (!model || model === "openrouter/auto:free")) {
    finalModel = "openrouter/auto";
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(providerName === "openrouter" ? { "HTTP-Referer": "https://bible.annaxie.com" } : {}),
    },
    body: JSON.stringify({ model: finalModel, messages, max_tokens: 4096, temperature: 0.7, stream: true }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error?.message || `${providerName} streaming error`);
  }
  return { stream: response.body!, model: finalModel, provider: PROVIDER_NAMES[providerName] || providerName };
}

// ── Main handler ──────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Parse body and authenticate in parallel to reduce latency
    const [authResult, body] = await Promise.all([
      supabase.auth.getUser(),
      req.json() as Promise<{ prompt: string; history: { role: string; content: string }[]; options?: any }>,
    ]);

    const { data: { user }, error: authError } = authResult;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt, history = [], options = {} } = body;

    // Use cached settings if available (saves ~300ms DB query)
    const wantsRace = options.autoRace === true || options.autoRace === "true";
    const wantsStream = options.stream === true || options.stream === "true";
    const cached = getCachedSettings(user.id);
    const [settingsResult, healthResult] = await Promise.all([
      cached ? Promise.resolve(null) : supabase.from("user_settings").select("settings").eq("user_id", user.id).single(),
      wantsRace
        ? supabase.from("provider_health").select("provider, model, response_ms, status, tested_at").eq("user_id", user.id)
        : Promise.resolve({ data: null }),
    ]);

    const settings = cached || ((settingsResult?.data?.settings || {}) as Record<string, string>);
    if (!cached) setCachedSettings(user.id, settings);

    // System prompt: forces the [SPLIT]-separated bilingual response format
    // that the client's parseMessage relies on to populate Chinese and English panes.
    const SYSTEM_PROMPT = `You are a world-class Bible Scholar and Researcher.

CORE DIRECTIVE: Be extremely concise. Provide a brief overview or summary of the answer only.
Avoid long paragraphs unless specifically asked for a deep dive.

CRITICAL RULE: You must ALWAYS respond in two distinct sections: first Chinese, then English.
You MUST separate these sections with the exact string "[SPLIT]" on its own line.

RESPONSE STRUCTURE:
[Brief Chinese summary and key points]
如果您需要更深入的解析或特定细节，请告知。
[SPLIT]
[Brief English summary and key points]
Please let me know if you would like more in-depth details or a specific deep dive.

BILINGUAL KEYWORDS: In the Chinese section, append the English equivalent in parentheses after key theological terms, proper nouns, and important concepts on first mention — e.g. 圣灵 (Holy Spirit), 圣约 (Covenant), 以弗所书 (Ephesians). This helps the reader anchor Chinese terms to their English counterparts.

Maintain professional scholarship even in brevity.

LANGUAGE REQUIREMENT (MANDATORY):
- Always write your response in Simplified Chinese (简体中文) as the primary language.
- Keep these items in English: key theological/technical terms (e.g. covenant, atonement, eschatology), proper nouns (people, places), book names, and Bible references (e.g. Genesis 15:6, John 3:16).
- Optionally add a brief Chinese gloss in parentheses after the first occurrence of an English term, e.g. "covenant（约）".
- This applies to every response — reflections, summaries, scripture suggestions, chat replies, titles, tags, and all other output — regardless of the language of the user's input.`;

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: prompt },
    ];

    // Image is passed to callSingleProvider which formats per provider

    // ── Race mode: autoRace=true and 3+ configured models across providers ──
    const hasImage = !!options.image;
    if (wantsRace) {
      // Gather all models from all configured providers
      const candidates: { name: string; apiKey: string; model: string }[] = [];
      for (const [prov, keyName] of Object.entries(PROVIDER_KEY_NAMES)) {
        const key = settings[keyName];
        if (!key) continue;
        const models = ALL_MODELS[prov] || [DEFAULT_MODELS[prov]].filter(Boolean);
        for (const m of models) {
          // Skip non-vision models when request includes an image
          if (hasImage && !VISION_MODELS.has(m)) continue;
          candidates.push({ name: prov, apiKey: key, model: m });
        }
      }

      if (candidates.length >= 3) {
        // Use pre-fetched health data (queried in parallel with settings above)
        const healthData = healthResult?.data;

        // Build speed map and error set keyed by "provider:model"
        // Only exclude models that failed in the last 10 minutes (not permanently)
        const speedMap = new Map<string, number>();
        const errorSet = new Set<string>();
        const tenMinAgo = Date.now() - 10 * 60 * 1000;
        if (healthData) {
          for (const h of healthData as any[]) {
            const key = `${h.provider}:${h.model}`;
            if (h.status === "ok") {
              speedMap.set(key, h.response_ms);
            } else {
              const testedAt = h.tested_at ? new Date(h.tested_at).getTime() : 0;
              if (testedAt > tenMinAgo) {
                errorSet.add(key);
              }
            }
          }
        }

        // Filter out known-bad models, sort by speed (fastest first, untested last)
        const eligible = candidates
          .filter(c => !errorSet.has(`${c.name}:${c.model}`))
          .sort((a, b) => {
            const aMs = speedMap.get(`${a.name}:${a.model}`) ?? 99999;
            const bMs = speedMap.get(`${b.name}:${b.model}`) ?? 99999;
            return aMs - bMs;
          });

        // Diversify: pick at most 1 model per provider (fastest from each),
        // then fill remaining slots with additional models from providers
        const diversified: typeof eligible = [];
        const providerPicked = new Map<string, number>();
        const uniqueProviders = new Set(eligible.map(c => c.name)).size;
        // Allow more models per provider when few providers are available
        const maxPerProvider = uniqueProviders >= 3 ? 2 : 5;
        // Round 1: one per provider (fastest)
        for (const c of eligible) {
          if (!providerPicked.has(c.name)) {
            diversified.push(c);
            providerPicked.set(c.name, 1);
            if (diversified.length >= 5) break;
          }
        }
        // Round 2+: fill remaining slots with additional models from providers
        if (diversified.length < 5) {
          for (const c of eligible) {
            const count = providerPicked.get(c.name) || 0;
            if (count < maxPerProvider && !diversified.includes(c)) {
              diversified.push(c);
              providerPicked.set(c.name, count + 1);
              if (diversified.length >= 5) break;
            }
          }
        }

        if (diversified.length >= 3) {
          // Streaming race: first token wins, then stream that response
          if (!hasImage) {
            try {
              const streamRacers: StreamRacer[] = diversified.map(c => ({
                name: c.name, apiKey: c.apiKey, model: c.model,
                providerLabel: PROVIDER_NAMES[c.name] || c.name,
              }));
              const { winnerStream, winnerModel, winnerProvider, raceDetails } = await raceStreaming(
                streamRacers, messages, prompt, supabase, user.id,
              );

              // Prepend metadata + racePool as first SSE event, then pipe winner stream
              const meta = {
                meta: true, model: winnerModel, provider: winnerProvider,
                raceMode: true,
                racePool: raceDetails.map(d => ({
                  provider: d.provider, model: d.model,
                  responseMs: d.responseMs, status: d.status,
                })),
              };
              const metaEvent = `data: ${JSON.stringify(meta)}\n\n`;
              const combinedStream = new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode(metaEvent));
                  const reader = winnerStream.getReader();
                  function pump(): Promise<void> {
                    return reader.read().then(({ done, value }) => {
                      if (done) { controller.close(); return; }
                      controller.enqueue(value);
                      return pump();
                    });
                  }
                  pump();
                },
              });

              return new Response(combinedStream, {
                headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
              });
            } catch (error) {
              // Streaming race failed — try single-provider streaming with fastest known model
              if (wantsStream && diversified.length > 0) {
                try {
                  const preferred = diversified[0];
                  const { stream, model: usedModel, provider: providerLabel } = await streamProvider(
                    preferred.name, preferred.apiKey, preferred.model, messages, prompt
                  );
                  const metaEvent = `data: ${JSON.stringify({ meta: true, model: usedModel, provider: providerLabel })}\n\n`;
                  const fallbackStream = new ReadableStream({
                    async start(controller) {
                      controller.enqueue(new TextEncoder().encode(metaEvent));
                      const reader = stream.getReader();
                      try {
                        while (true) {
                          const { done, value } = await reader.read();
                          if (done) break;
                          controller.enqueue(value);
                        }
                      } finally { controller.close(); }
                    },
                  });
                  return new Response(fallbackStream, {
                    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
                  });
                } catch {
                  // Fall through to non-streaming race
                }
              }
            }
          }

          // Non-streaming race (for images, or streaming race fallback)
          try {
            const { winner, raceDetails } = await raceProviders(diversified, messages, prompt, supabase, user.id, hasImage ? options.image : undefined);
            return new Response(JSON.stringify({
              text: winner.text,
              model: winner.model,
              provider: winner.provider,
              responseMs: winner.responseMs,
              raceMode: true,
              racePool: raceDetails.map(d => ({
                provider: d.provider,
                model: d.model,
                responseMs: d.responseMs,
                status: d.status,
              })),
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          } catch (error) {
            return new Response(JSON.stringify({
              error: `All models failed. ${error instanceof Error ? error.message : ""}`,
            }), {
              status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
      // Fall through to single provider if < 3 eligible models
    }

    // ── Single provider mode ──
    let provider = settings["ai_provider"] || "openrouter";
    let apiKeyName = PROVIDER_KEY_NAMES[provider];
    let apiKey = apiKeyName ? settings[apiKeyName] : null;

    // If image attached but current provider/model doesn't support vision, find one that does
    if (hasImage) {
      const currentModel = options.model || settings["ai_model"] || DEFAULT_MODELS[provider] || "";
      if (!VISION_MODELS.has(currentModel)) {
        // Try to find a configured provider with a vision-capable model
        for (const [prov, keyName] of Object.entries(PROVIDER_KEY_NAMES)) {
          const key = settings[keyName];
          if (!key) continue;
          const visionModel = (ALL_MODELS[prov] || []).find(m => VISION_MODELS.has(m));
          if (visionModel) {
            provider = prov;
            apiKeyName = keyName;
            apiKey = key;
            options.model = visionModel;
            break;
          }
        }
      }
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `No API key configured for ${provider}. Go to Settings to add one.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = options.model || settings["ai_model"] || DEFAULT_MODELS[provider] || "";

    // ── Streaming mode (no image, single provider) ──
    if (wantsStream && !hasImage) {
      try {
        const { stream, model: usedModel, provider: providerLabel } = await streamProvider(provider, apiKey, model, messages, prompt);

        // Prepend a metadata event so the client knows model/provider
        const metaEvent = `data: ${JSON.stringify({ meta: true, model: usedModel, provider: providerLabel })}\n\n`;
        const metaStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(metaEvent));
            const reader = stream.getReader();
            function pump(): Promise<void> {
              return reader.read().then(({ done, value }) => {
                if (done) { controller.close(); return; }
                controller.enqueue(value);
                return pump();
              });
            }
            pump();
          },
        });

        return new Response(metaStream, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error instanceof Error ? error.message : `${provider} streaming error` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Non-streaming single provider ──
    try {
      const result = await callSingleProvider(provider, apiKey, model, messages, prompt, hasImage ? options.image : undefined);

      // Save timing (fire and forget)
      supabase.from("provider_health").upsert({
        user_id: user.id,
        provider,
        model: result.model,
        status: "ok",
        response_ms: result.responseMs,
        response_length: result.text.length,
        tested_at: new Date().toISOString(),
        error_message: null,
      }, { onConflict: "user_id,provider,model" }).then(() => {}).catch(() => {});

      return new Response(JSON.stringify({
        text: result.text,
        model: result.model,
        provider: result.provider,
        responseMs: result.responseMs,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : `${provider} API error` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
