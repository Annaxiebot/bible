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

  if (providerName === "gemini") {
    const geminiModel = model || "gemini-3-flash-preview";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
    // Gemini image format: inlineData in parts
    const parts: any[] = [{ text: typeof messages[messages.length - 1]?.content === "string" ? messages[messages.length - 1].content : prompt }];
    if (image) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: messages.map((m, i) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: i === messages.length - 1 ? parts : [{ text: typeof m.content === "string" ? m.content : prompt }],
        })),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Gemini API error");
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { text, model: geminiModel, provider: "Gemini", responseMs: Date.now() - startTime };

  } else if (ANTHROPIC_PROTOCOL_PROVIDERS.has(providerName)) {
    // Claude/Anthropic image format: type "image" with source
    const anthropicMessages = messages.map((m, i) => {
      if (i === messages.length - 1 && image) {
        return {
          role: m.role,
          content: [
            { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.data } },
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
      body: JSON.stringify({ model, max_tokens: 4096, messages: anthropicMessages }),
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
        return {
          role: m.role,
          content: [
            { type: "text", text: typeof m.content === "string" ? m.content : prompt },
            { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } },
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settingsRow } = await supabase
      .from("user_settings").select("settings").eq("user_id", user.id).single();

    const settings = (settingsRow?.settings || {}) as Record<string, string>;

    const body = await req.json() as { prompt: string; history: { role: string; content: string }[]; options?: any };
    const { prompt, history = [], options = {} } = body;

    const messages = [
      ...history.map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: prompt },
    ];

    // Image is passed to callSingleProvider which formats per provider

    // ── Race mode: autoRace=true and 3+ configured models across providers ──
    const hasImage = !!options.image;

    if (options.autoRace) {
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
        // Get health data to exclude known-bad models and sort by speed
        const { data: healthData } = await supabase
          .from("provider_health")
          .select("provider, model, response_ms, status")
          .eq("user_id", user.id);

        // Build speed map and error set keyed by "provider:model"
        const speedMap = new Map<string, number>();
        const errorSet = new Set<string>();
        if (healthData) {
          for (const h of healthData as any[]) {
            const key = `${h.provider}:${h.model}`;
            if (h.status === "ok") {
              speedMap.set(key, h.response_ms);
            } else {
              errorSet.add(key);
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
        // then fill remaining slots with second-fastest from providers
        const diversified: typeof eligible = [];
        const providerPicked = new Map<string, number>();
        // Round 1: one per provider (fastest)
        for (const c of eligible) {
          if (!providerPicked.has(c.name)) {
            diversified.push(c);
            providerPicked.set(c.name, 1);
            if (diversified.length >= 5) break;
          }
        }
        // Round 2: fill remaining slots with second models from providers
        if (diversified.length < 5) {
          for (const c of eligible) {
            const count = providerPicked.get(c.name) || 0;
            if (count < 2 && !diversified.includes(c)) {
              diversified.push(c);
              providerPicked.set(c.name, count + 1);
              if (diversified.length >= 5) break;
            }
          }
        }

        if (diversified.length >= 3) {
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
    const provider = settings["ai_provider"] || "openrouter";
    const apiKeyName = PROVIDER_KEY_NAMES[provider];
    const apiKey = apiKeyName ? settings[apiKeyName] : null;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `No API key configured for ${provider}. Go to Settings to add one.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = options.model || settings["ai_model"] || DEFAULT_MODELS[provider] || "";

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
