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

// Provider API endpoints
const PROVIDER_ENDPOINTS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  claude: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
  openai: "https://api.openai.com/v1/chat/completions",
  kimi: "https://api.moonshot.cn/v1/chat/completions",
};

// Provider API key storage key names (must match constants/storageKeys.ts)
const PROVIDER_KEY_NAMES: Record<string, string> = {
  openrouter: "openrouter_api_key",
  claude: "claude_api_key",
  gemini: "gemini_api_key",
  openai: "openai_api_key",
  kimi: "kimi_api_key",
};

// Default models per provider
const DEFAULT_MODELS: Record<string, string> = {
  openrouter: "openrouter/auto",
  claude: "claude-sonnet-4-5",
  gemini: "gemini-3-flash-preview",
  openai: "gpt-4o-mini",
  kimi: "moonshot-v1-128k",
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

    if (provider === "claude") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || "Claude API error" }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const text = data.content?.[0]?.text || "";
      return new Response(JSON.stringify({ text, model, provider: "Claude" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (provider === "gemini") {
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
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return new Response(JSON.stringify({ text, model: geminiModel, provider: "Gemini" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      // OpenRouter, OpenAI, Kimi — all use OpenAI-compatible format
      const endpoint = PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.openrouter;
      const useFreeRouter = provider === "openrouter" && (options.useFreeRouter !== false);
      const finalModel = useFreeRouter ? "openrouter/auto" : model;

      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(provider === "openrouter" ? { "HTTP-Referer": "https://bible.annaxie.com" } : {}),
        },
        body: JSON.stringify({
          model: finalModel,
          messages,
          max_tokens: 4096,
          temperature: 0.7,
        }),
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
      const providerName = provider === "openrouter" ? "OpenRouter" : provider === "openai" ? "OpenAI" : "Kimi";

      return new Response(JSON.stringify({ text, model: usedModel, provider: providerName }), {
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
