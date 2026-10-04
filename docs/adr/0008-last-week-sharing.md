# ADR-0008: Last week's sharing opens the next meeting (2026-10-03)

Status: accepted. Owner goal (Chris): close the live-it-out loop — next
Friday's presentation opens with a slide summarising last week, prepared by
AI from ONLY what members chose to share, reviewed by the leader before it
shows.

## Context

At sign-up a member commits to one life-menu practice (ADR-0004 §7). During
the week the check-in page lets them answer privately ("只记在我的手机 Keep
private", never sent) or "分享给组长 Share with leader", which writes
`checkin_answers` through `share_checkin_answer()`. The leader page already
lists both. Hosted AI (ADR-0007) already reserves the role `sharing`
(model chosen by the server, `max_tokens` 3000, 10 per leader per month).

## Decision

1. **The control.** The New-study editor shows "生成上周分享 · Prepare last
   week's sharing" above the sections, with a "上一次查经 · Previous study"
   select: the leader's other packs (this browser's store, filled from the
   account by the sign-in merge, ADR-0006), newest first; the default is the
   newest pack dated on or before the current one (else the newest).
   Signed out the control is hidden: there are no rows to read.
   (`components/sharing/SharingControl.tsx`, `useSharing.ts`.)
2. **What is read.** As the signed-in leader, with the leader page's own
   queries (`leaderData.fetchSignups` / `fetchAnswers`: RLS
   `leader_id = auth.uid()` plus a client-side uid filter) for the previous
   pack id. Every `checkin_answers` row is, by construction, an answer the
   member chose to share; private answers never reach the server.
3. **What is sent to the AI — and what is not.** `sharingData.loadSharingMaterial`
   reduces the rows to: practice counts per life area (every chosen
   practice counts once per member, `commitmentCounts`; ADR-0004 §7
   amendment 2026-10-04), answer TEXT only (newest 40, each ≤ 500 characters),
   and the previous pack's closing question. Never sent: names, emails,
   phones, signup or answer ids, timestamps, the member's own practice
   wording (`practice_note`), any practice text. Before anything leaves the
   browser, every answer passes `sharingScrub.makeScrubber`: exact occurrences
   of the pack's member names (and each name word of 2+ characters; Latin as
   whole words), stored emails and phones, plus anything email-shaped or
   phone-shaped (7+ digits), become "（…）". The same scrubber runs over the
   AI's reply. Over-scrubbing (a digit-only date, a common word that is also
   a member's name) is accepted; under-scrubbing is not.
4. **The prompt** (`sharingPrompt.ts`) uses `principles.SHARING_CONTENT_CONTRACT`
   (Chinese first; report only what members said; no theological claims,
   verses, advice or health claims added; three kinds of claims kept
   separate; quotes are anonymised paraphrases, never verbatim, no
   identifiers) and the CURRENT pack's `CONTENT_LANGUAGE_CONTRACTS` line
   rule. Reply: strict JSON `{ themes: 2–3, quotes: 0–3 (≤ 40 字), question: 1 }`,
   each item with the halves the mode requires (generatedPack's rules). One
   fresh retry on a reply that does not parse or validate; then a typed
   `SharingError('invalid-reply')`. Transport failures keep the existing
   askAIErrors lines (quota, credit used up, sign in, network) as
   `SharingError('ai')`.
5. **Zero shared answers → no AI call.** The section is the app-owned
   practice-count line alone ("上周大家选择的操练 · Practices chosen last week:
   健康 Health 3, 家庭 Family 2"), and the control says so. No sign-ups and
   no answers → a typed failure, nothing inserted.
6. **The section.** New optional `SectionKind` `sharing`, heading
   "上周操练分享 · Last week's sharing"; `parseStudyPack` requires a
   non-empty body. Body lines in order: themes → quotes as 「…」 → the
   practice-count line → the opening question (always the last line; no
   extra field, so the generic lines editor edits all of it). It sits only
   at index 1, right after the title (`sectionRules`: fixed in place,
   removable, never in the add menu; a second run replaces it), so
   `buildSlides` emits it as slide 2, with the usual body continuation
   slides when long. TVSlide renders it with the body style; 「…」 lines on
   a sharing slide use the quieter `text-stl-text-2`.
7. **Leader review is the gate.** The draft lands in the editor as an
   ordinary editable section; auto-save persists it; nothing is presented
   until the leader opens Preview / TV mode. The leader can edit any line or
   remove the section.
8. **No schema bump.** `PACK_SCHEMA_VERSION` stays 2: packs without the
   section render unchanged, and the version only cache-busts committed
   public pack JSON, which never carries a sharing section.

## Consequences

- **Consent wording.** Members tapped "Share with leader", not "share with
  an AI service". The text that reaches the AI provider (OpenRouter → the
  model vendor) is anonymised and scrubbed, and the hosted proxy logs no
  content (ADR-0007), but a member's free text can still carry details the
  scrubber cannot recognise (a place, an employer). If the owner wants
  explicit consent, the check-in page's share button needs a line such as
  "组长可能用AI整理匿名摘要". Done: the check-in privacy line (CK_PRIVACY)
  now says the leader may use AI to turn shared answers into an anonymous
  summary, so members see it before they press Share.
- The summary is stored in the pack (IndexedDB + owner-only `study_packs`);
  `public_signup_pack` does not expose sections, so it stays private to the
  leader until shown.
- An old app bundle (cached on a TV browser) that meets a pack with a
  `sharing` section rejects the pack as unknown kind; reloading the app fixes it.
- Quota: one Prepare is one `sharing` request, two when the first reply is
  invalid.
