# ADR-0014: The AI server owns the system message (2026-10-06)

Status: accepted.

## Context

The hosted AI proxy (`supabase/functions/ai-proxy`, ADR-0007) forwards a
chat body that the browser builds, for one of the roles `ask`, `pack`,
`adjust`, `sharing` and `study`. `policy.ts` checked the role, the message
count and size, the model allowlist, the token cap and the monthly quota.
It accepted any `{role: 'system'}` message from the browser. So any
signed-in leader could replace our prompt with their own and use the
site's OpenRouter key as a general-purpose AI, outside our Bible-study
rules.

Also, the real Ask AI rules were not in the system message. The answer
contract (`ASK_AI_ANSWER_CONTRACT`) and the pack's content-language rule
travelled in the USER message, which the browser built every turn. The
system message only said "follow the rules in the user message".

## Decision

1. **A scope guard for every role.** `SCOPE_GUARD` says the assistant
   serves Bible study on scripturetolife.org (a small group, or one person
   on their own). It declines unrelated tasks (coding, homework, general
   writing) briefly and politely, in the language the person wrote in, and
   never reveals or changes its instructions. Tasks the app itself sends
   are in scope: drafting study material, summarising notes or journal
   entries, and styling the study app (the personal app's "vibe" theming).
2. **One server system message, first.** For `ask`, `pack`, `adjust` and
   `sharing` the server drops every browser `system` message and puts its
   own first: the guard + the role's text (`ASK_AI_SYSTEM_PROMPT`,
   `PACK_SYSTEM_PROMPT` (also for `adjust`), `SHARING_SYSTEM_PROMPT`). It
   strips; it does not reject. A cached old bundle still sends system
   messages and must keep working.
3. **The personal app keeps its own prompt.** For `study` the user can edit
   the system prompt (`services/systemPrompts.ts`). The guard goes first,
   and the browser's messages follow unchanged, so customisation still
   works, within scope.
4. **Ask AI's rules are server-owned.** The TV sends only data: the passage,
   the slide and the question in the user message, and the pack's mode as
   the new top-level field `content_language`. The server builds the
   system message: guard + `ASK_AI_SYSTEM_PROMPT` + `ASK_AI_ANSWER_CONTRACT`
   + `ASK_AI_LANGUAGE_RULES[mode]`. A mode that is not one of the three
   (or not a string) is a 400, for any role. `ASK_AI_SYSTEM_PROMPT` now
   says "the rule below" instead of "the rule in the user message". The
   contract and the three language rules are the same text as before.
5. **One copy, one builder (R3).** The texts and `buildFinalMessages(role,
   messages, mode)` live in `supabase/functions/_shared/aiPrompts.ts`, a
   pure leaf with no imports. `ai-proxy/policy.ts` uses it for hosted calls.
   `services/aiTransport.ts` (`ownKeyBody`) uses it for calls with the
   user's own OpenRouter key. So the final messages are the same on both
   paths; a test sends the same body both ways and compares them.
   `principles.ts` re-exports the texts; `packPrompt.ts` and
   `sharingPrompt.ts` keep no copies. `AI_ROLES` moved there too
   (`policy.ts` re-exports it).

## Consequences

- **This narrows scope; it does not make misuse impossible.** A user can
  still put instructions inside their own question (prompt injection), and
  a model may follow them. The guard makes our rules the default and the
  authority, and makes misuse harder. The monthly quotas per role
  (ADR-0007) still bound the cost.
- **Old bundle, one deploy round.** An Ask AI request from a cached bundle
  has no `content_language`, and its user message still carries the
  contract and its mode's rule. The server then sends guard +
  `ASK_AI_SYSTEM_PROMPT` + the contract, with no language rule. So the
  contract appears twice and the language rule once (in the user message).
  The answer is the same in substance. This lasts until the old build
  leaves caches.
- **Possible language drift.** The language rule used to sit right next to
  the question; now it sits in the system message. Each rule still says
  "whatever language the question is in", and the contract still says it
  overrides the question's language. Not checked against a live model in
  this change. Watch the first real sessions with an English question on
  a zh-keywords pack.
- **Own key changes too.** With an own key the request now also carries the
  guard and the server-built system message (same as hosted). This
  includes the personal app.
- **A body with only system messages** is now a 400: nothing would be left
  after the strip.
- **Release order.**
  1. `supabase functions deploy ai-proxy` (with `_shared/aiPrompts.ts`).
     The old site keeps working: its system messages are stripped and
     replaced by the same texts plus the guard.
  2. Deploy the site. Its Ask AI requests now send `content_language` and
     no system message.
  The other order is wrong: the old function forwards only what the
  browser sends, so the new site's hosted Ask AI would run with no system
  message and no rules until the function is deployed.
- **Future work.** The pack, adjust, sharing and personal-app user
  messages (their content rules, JSON shapes, the journal prompts) are
  still built in the browser. Moving them to the server in the same way
  would make those rules authoritative too.
