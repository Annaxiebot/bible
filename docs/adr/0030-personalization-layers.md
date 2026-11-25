# ADR-0030: Personalization — view prefs and leader standing instructions

Date: 2026-11-25 · Status: accepted

## Context

The owner's direction (2026-11-25): AI makes software creation cheap, so the
product should let anyone personalize their experience, with AI carrying the
customization. For this app the highest-value surface is not the chrome but
the generated content and how the pack is shown.

## Decision

Two layers, both config-not-code:

1. **显示偏好 View preferences** (`shared/studypack/packPrefs.ts`): any
   viewer — leader or member — hides optional sections and swaps the 中/英
   line order on their device. A pure view-time transform applied between
   pack load and `buildSlides`; the stored pack, the share link and other
   viewers are untouched. localStorage only, since members have no account.
   The spine (title, scripture, discussion, closing) is never hideable.
2. **组长定制 Leader standing instructions**
   (`apps/site/newstudy/leaderInstructionsDefault.ts`): free text honored on
   every generation, entered once under 更多选项, remembered and synced like
   the content language (ADR-0005). It enters both generation prompts
   (passage and guide paths) as a fenced user-turn block — the server owns
   the system prompt (ADR-0014) and the block states it never overrides the
   format rules. Capped at 500 chars (one fail-closed cap).

Deferred: a natural-language "set my preference" box that maps free text to
view prefs needs a new intent in the ai-proxy (its system prompt is the
Bible-QA scope guard); see docs/TODO.md.

## Consequences

- Per-viewer display changes can never corrupt a pack or leak to the group.
- Leader taste lives in one synced setting, not in per-pack retyping.
- The WORSHIP_SONGS_DEFAULT sync gap (writer rang the bus, key not in
  LEADER_SYNCED_KEYS) was fixed in passing.
