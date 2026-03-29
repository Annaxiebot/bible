/**
 * ai-chat Edge Function
 *
 * Proxies AI chat requests to the user's configured provider.
 * Reads API keys from user_settings table — no secrets exposed to the client.
 *
 * POST /ai-chat
 * Body: { prompt, history, options: { model?, thinking?, fast?, search?, image? } }
 * Auth: Bearer token (Supabase JWT)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Provider API endpoints (OpenAI-compatible use /chat/completions)
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

// Providers that use Anthropic Messages API format (not OpenAI-compatible)
const ANTHROPIC_PROTOCOL_PROVIDERS = new Set(["claude", "zai"]);

// Provider API key storage key names (must match constants/storageKeys.ts)
const PROVIDER_KEY_NAMES: Record<string, string> = {
  openrouter: "openrouter_api_key",
  claude: "claude_api_key",
  gemini: "gemini_api_key",
  openai: "openai_api_key",
  kimi: "kimi_api_key",
  nvidia: "nvidia_api_key",
  deepseek: "deepseek_api_key",
  groq: "groq_api_key",
  dashscope: "dashscope_api_key",
  minimax: "minimax_api_key",
  zhipu: "zhipu_api_key",
  zai: "zai_api_key",
  r9s: "r9s_api_key",
  moonshot: "moonshot_api_key",
};

// Default models per provider
const DEFAULT_MODELS: Record<string, string> = {
  openrouter: "openrouter/auto",
  claude: "claude-sonnet-4-6",
  gemini: "gemini-3-flash-preview",
  openai: "gpt-4o-mini",
  kimi: "moonshot-v1-128k",
  nvidia: "meta/llama-3.1-8b-instruct",
  deepseek: "deepseek-chat",
  groq: "llama-3.3-70b-versatile",
  dashscope: "qwen3.5-flash",
  minimax: "MiniMax-M2.5",
  zhipu: "glm-4-plus",
  zai: "glm-5",
  r9s: "claude-sonnet-4-6",
  moonshot: "kimi-k2.5",
};

interface ChatRequest {
  prompt: string;
  history: { role: string; content: string }[];
  options?: {
    model?: string;
    thinking?: boolean;
    fast?: boolean;
    search?: boolean;
    image?: { data: string; mimeType: string };
    useFreeRouter?: boolean;
  };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with user's JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user settings (contains API keys)
    const { data: settingsRow } = await supabase
      .from("user_settings")
      .select("settings")
      .eq("user_id", user.id)
      .single();

    const settings = (settingsRow?.settings || {}) as Record<string, string>;
    const provider = settings["ai_provider"] || "openrouter";
    const apiKeyName = PROVIDER_KEY_NAMES[provider];
    const apiKey = apiKeyName ? settings[apiKeyName] : null;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `No API key configured for ${provider}. Go to Settings to add one.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request
    const body: ChatRequest = await req.json();
    const { prompt, history = [], options = {} } = body;
    const model = options.model || settings["ai_model"] || DEFAULT_MODELS[provider] || "";

    // Build messages array
    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: prompt },
    ];

    // Add image if provided
    if (options.image && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      lastMsg.content = [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${options.image.mimeType};base64,${options.image.data}` } },
      ] as any;
    }

    // Route to provider
    let response: Response;
    const providerNames: Record<string, string> = {
      openrouter: "OpenRouter", claude: "Claude", gemini: "Gemini",
      openai: "OpenAI", kimi: "Kimi", nvidia: "NVIDIA",
      deepseek: "DeepSeek", groq: "Groq", dashscope: "DashScope/Qwen",
      minimax: "MiniMax", zhipu: "Zhipu/GLM", zai: "Z.AI",
      r9s: "R9S.AI", moonshot: "Moonshot/Kimi",
    };

    if (provider === "gemini") {
      // Gemini uses its own API format
      const geminiModel = model || "gemini-3-flash-preview";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: typeof m.content === "string" ? m.content : prompt }],
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || "Gemini API error" }), {
          status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return new Response(JSON.stringify({ text, model: geminiModel, provider: "Gemini" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (ANTHROPIC_PROTOCOL_PROVIDERS.has(provider)) {
      // Claude, Z.AI — use Anthropic Messages API format
      const endpoint = PROVIDER_ENDPOINTS[provider];

      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: 4096, messages }),
      });

      const data = await response.json();
      if (!response.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || `${provider} API error` }), {
          status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const text = data.content?.[0]?.text || "";
      return new Response(JSON.stringify({ text, model, provider: providerNames[provider] || provider }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      // All others: OpenAI-compatible format (OpenRouter, OpenAI, Kimi, NVIDIA, DeepSeek, Groq, etc.)
      const endpoint = PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.openrouter;
      // Handle openrouter/auto:free (free models only) vs openrouter/auto (any model)
      let finalModel = model;
      if (provider === "openrouter") {
        if (!model || model === "openrouter/auto:free") {
          finalModel = "openrouter/auto";
          // Note: :free suffix is our UI convention, OpenRouter uses route params for free filtering
        } else if (model === "openrouter/auto") {
          finalModel = "openrouter/auto";
        }
      }

      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(provider === "openrouter" ? { "HTTP-Referer": "https://bible.annaxie.com" } : {}),
        },
        body: JSON.stringify({ model: finalModel, messages, max_tokens: 4096, temperature: 0.7 }),
      });

      const data = await response.json();
      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message || `${provider} API error` }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const text = data.choices?.[0]?.message?.content || "";
      const usedModel = data.model || finalModel;

      return new Response(JSON.stringify({ text, model: usedModel, provider: providerNames[provider] || provider }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
