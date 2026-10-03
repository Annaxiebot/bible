# ADR-0003: Scripture to Life content principles (2026-10-01)

Status: accepted. These principles bind every content-producing part of the app — hand-authored packs today, and the app's own AI engine tomorrow (pack generation from a leader's PDF or passage, on-screen Ask AI, mid-week check-ins). They were decided in a Claude Code session; this ADR exists so they outlive that session.

## Context

scripturetolife.org serves Chinese-speaking congregations. During the first week of building TV presentation mode (`components/studypack/`), several content decisions were made ad hoc and then corrected on screen by the product owner: English-first bilingual lines looked inconsistent on the TV, traditional-character scripture appeared where simplified was expected, WEB English read awkwardly ("don't be anxious", "Yahweh"), and verse references were plain text. Each correction is cheap once; re-learning them in every future session or AI prompt is not. R3 (no duplicated critical strings) applies to principles as much as to code: one source.

## Decision

### Language and translations 语言与译本

1. **Chinese first, English second, everywhere.** Every bilingual string — slide titles, section headings, body lines, life-menu labels, hint strings, Ask AI labels, verse popups, landing-page lines — shows 中文 first, then English after a separator (space or " · "). Single exception: the brand wordmark "Scripture to Life" stays first, with 活出神的話 beside or below it.
   *Note (2026-10-02):* "bilingual" means Chinese first; it does not mean every line carries a full English translation. The amount of English in the model-drafted lines is a per-pack setting, `contentLanguage` (`zh-keywords` | `bilingual` | `en-keywords`), chosen on the generation form and remembered as the leader's default. The default is `zh-keywords`: Simplified Chinese lines with each key theological/biblical term followed once by the English in parentheses, e.g. 忧虑（anxiety）. `bilingual` keeps the "中文 · English" lines; `en-keywords` is the mirror. Headings, the verses (和合本 + BSB) and the app-owned lines stay bilingual in every mode; Ask AI answers a `zh-keywords` pack in Chinese with English keywords by default. Packs without the field are read as `bilingual` and render unchanged. The three format contracts live in `components/studypack/principles.ts` (`CONTENT_LANGUAGE_CONTRACTS`).
2. **Scripture text is Simplified Chinese 简体 (和合本 CUV)** for display; the app's existing 简/繁 toggle may convert at display time. Pack data stores simplified.
3. **English translation is BSB (Berean Standard Bible)**, public domain. WEB is retired from new content. NIV and other copyrighted translations are never bundled, committed, or served.
4. **Bible text is bundled in the repo** (`public/bible-data/<translation>/<book>/<chapter>.json`, CUV + BSB) so slides, popups, and the reading view never depend on a third-party API during a meeting.

### Guide content fidelity 讲义内容忠实

5. **PDF path uses the guide literally.** A leader-uploaded study guide becomes a pack with its own intro, outline, and questions verbatim. The AI adds nothing uninvited; it only fills gaps the leader asks for.
6. **Leader-only material never reaches the screen.** 提示 (hints) and 参考 (reference answers) from a 组长版 guide stay in the leader's copy; the TV shows the questions.
7. **Our added layers are visibly ours.** Life menu, reflection prompts, QR sign-up, and the closing question are app-generated and must not be presented as part of the uploaded guide.

### Verse references 经文引用

8. **Every verse reference is interactive.** On slides and in AI answers, references (`v.24`, `vv.25–31`, `路加福音 12:22–31`, `Luke 12:22–31`, `腓4:6`) are clickable and show a popup with the verse text, 和合本 first then BSB, resolved from in-pack verses or the bundled Bible data — never a network lookup mid-meeting.

### Ask AI on the TV 大屏问答

9. **Short first, deeper on request.** First answers: at most 2 short sentences (~60 words), citing the verse, in the language of the question (Chinese question → Chinese answer with English keywords). Follow-ups go deeper (chapter → book → interpretations). Depth is pulled by the group, never pushed by the AI.
10. **Fits a 1080p screen.** Answers stream token-by-token and are sized to fill the panel without scrolling in the common case; the input never leaves the screen.
11. **The AI supports the discussion; the group leads it.** The leader controls when the panel is visible. The AI never replaces the pastor, the group, or the church.

### Flourishing model 整全人模型

12. **Seven stable life areas**: 健康 Health, 关系 Relationships, 家庭 Family, 工作 Work, 情绪 Emotional, 财务 Finance, 属灵 Spiritual. The taxonomy does not change week to week (it is the longitudinal measurement frame); the practices within each area do. Diet and exercise live inside Health. Health is the central research thread, not merely one category.
13. **Three kinds of claims stay separate.** "Scripture says X" (theological/interpretive) → "X may lead to behavior Y" (application hypothesis) → "Y affects physiology Z" (scientific claim requiring evidence). The last two are evidence-linked and never presented as biblical claims.
14. **Practice and reflection first; biometrics later, opt-in.**

### Readability 可读性

15. **Large type by default.** The audience includes many adults and seniors. Landing body text ≥ 20px desktop / 18px phone; TV-mode body and verse text ≥ 3.6vh on 1080p, headings ≥ 7vh, verse popups ≥ 3vh; phones get a px floor so vh units never shrink text below legibility. Sizes live in `components/studypack/principles.ts` (`TYPE_SCALE`) and scale with browser zoom (rem/clamp).
16. **Motion is decoration, never information.** Landing animations (hero loop, hover lifts) must respect `prefers-reduced-motion` and the page must read identically with motion off.

### Privacy 隐私

17. **Reflections are private by default**, stored on the member's own device; sharing is an explicit per-reflection choice. Sign-up data (name, phone) is used only for the mid-week check-ins the member opted into.

## Consequences

- **Code seam (TODO, next session touching `components/studypack/`):** export these rules as a typed constant module (e.g. `components/studypack/principles.ts`) that `buildAskAIPrompt` and the future pack generator import, so the prompt contract and this ADR cannot drift. Until then, `askAI.ts` carries the Ask AI contract (items 9–11) inline; keep the two in sync by hand.
- **Models (2026-10-02):** Ask AI (TV overlay) sends `google/gemini-2.5-flash` ($0.30/M in, $2.50/M out — about $0.001 per question); pack generation sends `anthropic/claude-sonnet-4.5` ($3/M in, $15/M out — about $0.06 per pack). Both are single constants in `services/aiDefaults.ts` (`ASK_AI_MODEL`, `PACK_GENERATION_MODEL`). Chosen for Chinese quality, latency (short answers must stream within seconds on a TV) and cost; the free router (`openrouter/free`) stays selectable in the advanced panel and is the last Ask-AI fallback, but is no longer the default because free picks were often reasoning models that spent the whole token budget thinking and returned no content.
- Tests that assert bilingual strings must import the string constants, not copy literals (R3; the R13 pre-push reviewer blocks verbatim duplicates).
- Any new translation must be public domain or explicitly licensed before it touches the repo (item 3).
- Supersedes nothing; extends ADR-0001's architecture review with content rules.
