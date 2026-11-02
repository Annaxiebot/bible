# 0028 — Slides must fit the screen: shrink floors, stable gutter, honest row caps

Date: 2026-11-01 · Status: accepted

## Context

A usability review found sample slides clipping the tail of the English
scripture at presentation size. Measured in Chromium at 1280×720, 10 of 26
sample slides overflowed their fit area by 19–153px. Three distinct causes:

1. **Optimistic row estimates.** slideFit.ts budgets rows from character-width
   estimates; English verses wrap longer than the em estimate, so 10-row
   scripture slides and 4-row life-menu slides never really fit at scale 1.
2. **Scrollbar hysteresis.** The fit area is `overflow-y-auto`. When content
   momentarily overflowed during the bisection search, the scrollbar appeared,
   narrowed the area, wrapped the text taller — and that state is
   self-consistent, so the search settled on a scale that fit WITHOUT the
   scrollbar but overflows WITH it. Slides then stayed clipped at rest.
3. **Late font metrics.** 霞鹜文楷 ships as unicode-range subsets; a slide's
   new glyphs can arrive after `document.fonts.ready`, growing the content
   without resizing the area — and the resize was not reliably delivered to
   the ResizeObserver, leaving a stale fit.

## Decision

- `contentOverflows` reads the AREA's scrollHeight (the content rect excludes
  children's bottom margins and under-counted).
- The fit area reserves its scrollbar gutter (`scrollbar-gutter: stable`), so
  measurements are identical with and without a scrollbar.
- The fit may now SHRINK below 1 when a built slide overflows, down to a
  per-slide floor that keeps the smallest fitted role at the ADR-0003 §15
  senior floor (3.6vh): body slides to 3.6/5, scripture to 3.6/3.8. Life-menu
  rows are AT their floor (3.4vh) and never shrink. `fitted()` clamps at 16px
  so the phone px floor binds under shrink.
- Honest row caps: scripture 10 → 9 rows, life menu 4 → 3 rows (the sample
  pack grows 26 → 28 slides; packTypes.test.ts and helpers/tv.ts pin it).
- Refit triggers: ResizeObserver on area AND content, `fonts.ready`,
  `fonts` `loadingdone`, plus two one-shot retries (350ms, 1200ms) because the
  font-swap resize was observed to go undelivered.

## Consequences

Verified in Chromium at 1280×720 and 1920×1080: all 28 sample slides fit
with zero overflow after settling. A slide that still overflows at its floor
scrolls with the thin themed bar, as before — scrolling stays the last resort.
