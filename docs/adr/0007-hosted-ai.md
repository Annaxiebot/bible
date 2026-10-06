# ADR-0007: Hosted AI — leaders need no key of their own (2026-10-03)

Status: accepted. Owner decision (Chris): "leaders must not need their own
OpenRouter key." Refined the same day: the AI page becomes a status page and
the own-key path stays possible but hidden.

## Context

Every AI feature (Ask AI on the TV, pack generation on #/new) called
OpenRouter from the browser with a key the visitor pasted on #/setup. For a
church small-group leader that key is the adoption barrier: an account on a
developer site, a credit card, a secret to paste on every device. ADR-0004
already gives leaders an identity (Google sign-in) and ADR-0005 a per-leader
row in Supabase, so the site can vouch for them instead.

## Decision

1. **One server-side key, behind a proxy.** `supabase/functions/ai-proxy`
   calls OpenRouter with ONE key held as the secret `OPENROUTER_API_KEY`.
   Any signed-in leader may call it: the gateway's `verify_jwt` checks the
   bearer and the function resolves the uid (anon client `auth.getUser()`,
   as in send-checkins). POST only; CORS for https://scripturetolife.org and
   http://localhost:* (preflight answered, other origins refused).
2. **The client's one seam.** `services/aiTransport.ts` decides per request:
   an own key stored in this browser → OpenRouter directly, exactly as before;
   else signed in → the proxy with the access token, the anon `apikey`
   header and a `role` (`ask` | `pack` | `adjust` | `sharing`); else a typed
   `sign-in-needed`. Ask AI and pack generation both stream through
   `askAIStream.streamChatCompletionDetailed`, which calls this seam; the
   proxy passes OpenRouter's SSE through unchanged, so one parser serves both
   paths.
3. **The server decides the model.** Per role a default (ask:
   `google/gemini-2.5-flash`; pack/adjust/sharing: `anthropic/claude-sonnet-4.5`)
   and an allowlist (ask also accepts the client's fallback chain). A
   requested model off the list gets the role default. `max_tokens` is
   clamped per role (ask 2000, pack 12000 = `PACK_MAX_TOKENS`, adjust 4000,
   sharing 3000); messages must be non-empty, ≤ 40, ≤ 60k characters (else
   400 `invalid-request`). The function imports nothing from the app bundle;
   its copies of the model ids and the pack cap are pinned equal to
   `services/aiDefaults.ts` / `packPrompt.ts` by a test.
4. **Per-leader monthly quotas.** `database/ai-usage-schema.sql`: `ai_usage`
   (leader × UTC month × role → count, plus the limit last applied); a
   leader may SELECT their own rows, nobody writes from a client. The only
   writer is `consume_ai_quota()`, SECURITY DEFINER, executable by
   `service_role` only, which increments atomically while under the limit
   and returns -1 otherwise. Limits come from secrets with defaults:
   `AI_MONTHLY_ASK`=300, `AI_MONTHLY_PACK`=10, `AI_MONTHLY_ADJUST`=100,
   `AI_MONTHLY_SHARING`=10. Over the limit → 429 `{ error: 'quota', role, limit }`.
5. **Hard stops.** `AI_PROXY_ENABLED=0` is the kill switch (503 `disabled`);
   a missing key is 503 `not-configured`; the OpenRouter account's credit is
   the final hard cap — its 402 becomes 402 `no-credit`, shown as
   "AI 额度已用完，请联系管理员 · AI credit used up, contact the admin". An
   OpenRouter 401/403 (the site key revoked) is 503 `upstream-auth`, never
   "your key is invalid".
6. **The AI page is a status page.** #/setup (route unchanged, title
   "AI 服务 AI service"): signed in → "已登录 · AI 已就绪（由本站提供）" and this
   month's usage ("本月 This month: 提问 12/300 · 查经包 1/10"); signed out →
   "登录即可使用AI · Sign in to use AI" + Google button. The own-key form and
   the model rows sit behind a low-emphasis toggle at the bottom ("高级：使用
   自己的 OpenRouter 密钥 · Advanced: use your own OpenRouter key"), open by
   default only when a key is stored. The New-study page and the TV overlay
   gate on "signed in OR own key" and never mention keys; the only own-key
   hint elsewhere is a link to the AI page on the hosted no-credit / paused
   error lines.

## Consequences

- **Switching OpenRouter accounts** is replacing the `OPENROUTER_API_KEY`
  secret (`supabase secrets set …`); no code change, no redeploy of the app.
- **Privacy.** The function never logs message content — one line per call:
  role, the first 8 characters of the uid, the status. `ai_usage` holds
  counts only. The own-key path still never sends the key to our servers.
- **Quota is counted before the call.** A request that then fails upstream
  still counts; a pack whose reply hits `max_tokens` takes a second `pack`
  slot for its continuation; an Ask-AI question can take up to three `ask`
  slots (reasoning retry, fallback). Limits are sized with that headroom.
- **Usage display.** A role never used this month shows 0/<default>; once
  used, the row carries the limit the server applied, so a changed secret
  shows after the leader's next call.
- **Preview builds** (annaxiebot.github.io/bible/preview/…) are not an
  allowed origin; hosted AI works on scripturetolife.org and localhost only.
- **Not done here:** the landing page's "一分钟设置 AI：粘贴密钥即可" line
  still reflects the key-first flow (owned by another session); the legacy
  `supabase/functions/ai-chat` (per-user provider keys, Scripture Scholar
  app) is unrelated and unchanged. (Removed 2026-10-05 — see "Personal app".)

## Personal app (2026-10-05)

Owner decision: the personal Bible app (#app) reuses the Scripture AI
settings instead of its own.

- **One settings screen.** #app's AI settings button (the chat header) opens
  the same "AI 服务 AI service" dialog as the study pages
  (`QuickAISetupDialog`). `components/AIProviderSettings.tsx` (the
  multi-provider panel) and the web-search provider select and the
  Sonnet/Haiku "深度思考" toggle are no longer reachable.
- **One AI path.** `services/studyAI.ts` carries every #app AI call (the
  chat, the journal's AI tools, vibe theming) through `askAIStream` →
  `aiTransport`: own key → OpenRouter directly; signed in → ai-proxy; else
  the chat shows the TV overlay's sign-in line with its "设置AI" button.
  Always streamed; the chat sends `BIBLE_SCHOLAR_SYSTEM_PROMPT`, and the
  history is trimmed newest-first to the proxy's message/character limits.
- **Role `study`.** Default model `google/gemini-2.5-flash` on the Ask-AI
  allowlist (the same list); `max_tokens` 4000 (bilingual long-form answers
  write the content twice — twice ask's 2000); monthly limit
  `AI_MONTHLY_STUDY`, default 100. The `ai_usage` role CHECK was widened to
  include it. The AI page's usage line always shows
  "个人研经 Personal Study n/100".
- **Paused, not rerouted.** Features the hosted proxy cannot serve show
  "图片、联网搜索、朗读暂不可用 · images, web search and read-aloud are
  unavailable for now" (chat) or "暂不可用 Unavailable for now" (sidebar):
  image attach / webcam (vision), web search (Perplexity, Tavily,
  Firecrawl, Exa, Brave), read-aloud (Gemini TTS, chat and notebook), the
  Voice Session (Gemini Live).
- **Old code removed (2026-10-05).** The multi-provider stack is deleted:
  `AIProviderSettings.tsx`, `VoiceSession.tsx`, `TextToSpeech.tsx`,
  `services/aiProvider.ts`, the direct clients (`gemini`, `claude`,
  `openai`, `kimi`, `perplexity`) and web-search clients (`tavily`,
  `firecrawl`, `exa`, `brave`), `utils/retryUtils.ts`, the unused parts of
  `services/openrouter.ts` (model catalog, auto-detect, `chatWithAI`), and
  the `supabase/functions/ai-chat` edge function (not deployed on this
  project when removed). Their localStorage keys (provider API keys, web-search choice,
  panel toggles) are removed on every app start by
  `services/obsoleteStorageKeys.ts`; the own OpenRouter key is kept. The
  build no longer receives `GEMINI_API_KEY` / `KIMI_API_KEY`.
