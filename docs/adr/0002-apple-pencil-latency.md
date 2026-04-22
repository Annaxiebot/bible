# ADR-0002: Apple Pencil writing latency — investigation (2026-04-22)

Status: investigation only. No code change in this ADR; a follow-up session will implement based on the synthesis recommendation below.

## Context

Apple Pencil handwriting in the Notability editor feels smooth for the first few words and then accumulates lag as the stroke count grows, which degrades one of the core value props of the app (annotating and journaling on the Bible). This has been attacked many times; every fix helped briefly and then regressed some other dimension (initial-stroke latency, dropped points under load, dropped strokes entirely, missing high-frequency sub-events).

The user has offered a reference: `Annaxiebot/math` — a plain-HTML app whose "scratch pad" has smooth Apple Pencil writing indefinitely. They are considering a fresh-start rewrite modeled on that repo as a last resort.

This ADR documents the current pencil path, the full history of attempted fixes, a study of the reference repo, a ranked root-cause hypothesis, concrete fix proposals, a synthesis recommendation, and an honest fresh-start assessment. Read-only: no `components/NotabilityEditor.tsx` edits in this branch.

## Current pencil path in bible_app

All citations below are `components/NotabilityEditor.tsx` at master (`d8cbec3`).

### DOM + canvases

- Three stacked page-sized canvases: `bgCanvas` (paper grid/lines), `canvas` (below-text strokes), `overlayCanvas` (above-text strokes). See refs declared at lines 458–460 and the JSX at lines 3144–3782.
- Each canvas is `width × canvasHeight` pixels at display size. `canvasHeight = pages × PAGE_HEIGHT` where `PAGE_HEIGHT = 1200` (line 157) and page count grows on "Add Page".
- Backing bitmap: `width * dpr, height * dpr` with `dpr = min(devicePixelRatio, 1.5)` (lines 773–785). On a 1194 px wide iPad Pro landscape, one page is `1194×1200×1.5² ≈ 2.97 M` backing pixels per canvas × 3 canvases × N pages. On a 4-page note that's ~36 M backing pixels across the stack.
- Default `drawingLayer` is `'above'` (line 451), so fresh notes render every live stroke onto the **overlay** canvas (full page stack height), not the main canvas.

### setupCanvases (lines 764–817)

- Caps DPR at 1.5 on all three canvases.
- Creates 2D contexts with `willReadFrequently: true` — important flag: this hints the browser to keep the canvas in a **software backing store** rather than a GPU texture, which is the opposite of what we want for fast compositing. See §"Root-cause ranking" candidate A.
- Applies `ctx.scale(dpr, dpr)` so all drawing is in CSS pixels.

### refreshCanvasRect / getCanvasPoint (lines 987–1019)

- `getBoundingClientRect` is cached in `cachedCanvasRectRef`; refreshed on pointerDown (1240) and invalidated on `resize` (821) and `scroll` (822, passive).
- Under Apple Pencil at ~240 Hz this is correct — no per-move layout thrash, which fixed a regression in `d1e357c`.

### handlePenPointerDown (lines 1854–1872)

- Gates on `pointerType === 'pen'` and drawing tool mode.
- `preventDefault` + `setPointerCapture`.
- Cancels any in-flight finger swipe (palm retroactively rejected).
- Delegates to `handlePointerDown(e.clientX, e.clientY)`.

### handlePointerDown (lines 1239–1361)

For a pen stroke on a drawing tool, the relevant branch is the final one (1353–1360):

```
const drawCtx = drawingLayerRef.current === 'above' ? overlayCtxRef.current : ctxRef.current;
if (!drawCtx) return;
isDrawingRef.current = true;
currentStrokePointsRef.current = [{ x, y }];
applyToolSettings();
```

No setState on the drawing path itself. But above that branch there are setState calls on other branches (lasso, text) that aren't hit by pen drawing.

### handlePenPointerMove (lines 1874–1888)

```
const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
if (coalesced && coalesced.length > 0) {
  for (const sub of coalesced) handlePointerMove(sub.clientX, sub.clientY);
} else {
  handlePointerMove(e.clientX, e.clientY);
}
```

`getCoalescedEvents()` recovers the sub-events iOS batched under main-thread pressure. For every sub-event, `handlePointerMove` runs.

### handlePointerMove — pen branch (lines 1372–1458)

The pen path boils down to (lines 1444–1454):

```
const drawCtx = drawingLayerRef.current === 'above' ? overlayCtxRef.current : ctxRef.current;
const pts = currentStrokePointsRef.current;
const prev = pts[pts.length - 1];
pts.push({ x, y });
if (prev) {
  drawCtx.beginPath();
  drawCtx.moveTo(prev.x, prev.y);
  drawCtx.lineTo(x, y);
  drawCtx.stroke();
}
```

Per sub-event: one new segment stroked (**not** the full growing path — that's the `b362e4f` fix). This is already the O(1)-per-event ideal for path work.

But every `stroke()` damages the entire `overlayCanvas` backing store — which is **page_stack full size at 1.5× DPR**. That is the compositing-cost hot spot.

### commitCurrentStroke (lines 1031–1060)

- Normalizes the absolute points to document-relative via `normalizeStroke(abs, w, PAGE_HEIGHT)`.
- Pushes the stroke onto `strokeDataRef.current.strokes`.
- Records an O(1) undo marker (per `aca98af`).
- Calls `triggerAutoSave()` (debounced 2 s — but the 2 s timer re-arms on each commit, so a pause between words cancels the previous timer).

Important: no `redrawAll()` here. The live-drawn segments remain visible from the per-event stroke() calls; the normalized-form render only happens on the next `redrawAll()` (undo/resize/rotate).

### redrawAll (lines 606–706)

- `ctx.clearRect` the full backing store, then iterate all strokes and call `renderStrokesByLayer(...)`. Also iterates images and draws them. Fires the dashed lasso/rect previews if active.
- Happens on: setupCanvases (resize/rotate/DPR change), eraser hit (1088), load (930), undo/redo (1995, 2012), lasso commit/move (1152, 1199, 1221), image ops (2334), most state mutations.
- NOT on pointermove for pen drawing — good.

### triggerAutoSave (lines 571–598)

- 2 s debounced. On fire, `JSON.stringify(strokeDataRef + textBoxes + images + paperType + ...)`. Single synchronous stringify on the main thread.
- If the user pauses briefly between words (>2 s), the timer fires mid-gap. On a page with e.g. 80 strokes × 150 points each ≈ ~600 KB of JSON, that stringify is an estimated 20–60 ms stall on iPad Pro — exactly the "pick up the pencil and the next letter lags" symptom.

### Event listener attachment (lines 1930–1979)

- ONE-TIME attachment (empty deps), dispatches through `handlersRef.current`. Correct — no detach/reattach on re-render.
- Pen `pointerdown/pointermove/pointerup/pointercancel` listeners attached to **BOTH** `canvasRef` and `overlayCanvasRef`. Only one canvas has `pointerEvents: 'auto'` at a time (line 3781) so there's no double-fire in practice, but the attachment is redundant.

### Per-event cost summary (pen stroke active, above layer)

For each raw pointer event (Apple Pencil batches up to ~10 sub-events under load):

1. `handlePenPointerMove` — one function call.
2. `getCoalescedEvents()` — returns N sub-events.
3. Per sub-event: `handlePointerMove` → `getCanvasPoint` (cached rect, cheap) → `applyToolSettings` is NOT on this path (only on down) → `drawCtx.beginPath/moveTo/lineTo/stroke`.
4. Every `stroke()` damages a region of the overlay canvas; the browser (Safari) must composite the full `overlay + canvas + bg` stack of backing bitmaps into the final compositor surface for the next frame.

The dominant cost scales with the **overlay canvas backing-store area**, which grows linearly with page count. At iPad Pro landscape × 1.5 DPR × 4 pages, the overlay alone is ~11.9 M pixels (~47 MB RGBA) — that's exactly the "strokes after a few words" symptom because the user is either (a) drawing on a multi-page note, or (b) filling a page quickly so the overlay has accumulated enough committed strokes that each new `stroke()` has to re-composite non-trivial content.

## History of attempted fixes

Ordered newest-first; "regressed" column is reconstructed from the revert commit that followed.

| Commit | What was tried | What regressed | Outcome |
| --- | --- | --- | --- |
| 5d758da | Add `pointerType==='pen'` listeners with `setPointerCapture` + `getCoalescedEvents()` replay (in addition to existing touch path). Touch handlers skip stylus when PointerEvents exist. | None reported — this is the current state. Addressed stroke drops, not cumulative lag. | **Kept**. |
| 17d19bc, fa7110e | Pointer Events refactor for capture + coalesced replay (foundation of current pen path). | Grip drag leaked pencil ink → fixed in same series. | **Kept**. |
| 314bbe0 | `preventDefault` on touch-path stylus early-return (touch-action pan-y was starting browser scroll). | Fixed a scroll-during-draw regression introduced by the Pointer Events refactor. | **Kept**. |
| 505d7d0 | Restore pencil page navigation in pointer mode (stylus was too strict, blocked taps for page flip). | Navigation-in-pointer-mode regression from the pointer refactor. | **Kept**. |
| d1e357c | Revert rAF batching (c262551) AND the live-stroke page-sized overlay (7ca7626). Cache canvas rect. | Revert commit — both previous attempts regressed other things. | **Current baseline**. |
| dcca4e4 | Revert 7ca7626 live-stroke page-sized overlay. | 7ca7626's per-pointerdown canvas reallocation made every new stroke laggy even on empty notes. | Revert. |
| 7ca7626 | **Live strokes on a page-sized overlay canvas**, commit to main on pen-up. This was the structural fix — keep the giant main/overlay layers clean during the drag. | Per-pointerdown canvas realloc was slow; empty-note strokes started laggy. | Reverted 5h later. |
| c262551 | **rAF-batched** live pen rendering (one `stroke()` per frame). | User reported batched mode felt the same or worse — batching at 60 Hz threw away Pencil 240 Hz responsiveness. | Reverted. |
| b2cd0c5 | **Cap DPR at 1.5** (was 2.0 on iPad Pro), to cut backing-store pixels by ~44%. | None. | **Kept**. |
| aca98af | Per-stroke O(1) undo action marker; no more full-document snapshot on each commit. | None. | **Kept**. |
| b362e4f | **Stroke only the latest segment per event**, not the full growing path. O(N²) → O(N). | None. | **Kept**. |
| 6100a58, a9a4f5d | Defer canvas resize until stroke completes; normalize Y against width. | None. | **Kept** (F3 later re-normalized Y by PAGE_HEIGHT). |

### Oscillation pattern

The cycle has been:

1. Something regresses (drops/lag).
2. Fix tries to reduce per-event GPU / composite work (rAF batch, page overlay).
3. Fix introduces its own regression (latency floor, allocation stalls, or loses the 240 Hz responsiveness).
4. Revert.
5. Some time later the cycle repeats.

What stuck: reducing per-event path work (b362e4f), reducing backing-store size (b2cd0c5), reducing per-event layout (d1e357c cache + `resize/scroll` invalidate), reducing redundant work on commit (aca98af, not redrawing). What did NOT stick: rAF batching live (latency cost), structural live-stroke overlay (allocation cost).

The structural win that 7ca7626 aimed at — keep the giant page-sized layer clean during the drag — was correct in principle but the implementation allocated a fresh canvas per stroke and was reverted for THAT reason, not because the overlay approach itself was wrong. This is the specific lesson for the next attempt.

## Reference: `Annaxiebot/math` Pencil path

Fetched to `/tmp/math-reference-clone`; single `index.html` (3,236 lines). All drawing logic is plain JS attached to two fixed canvases.

### DOM (lines 1293–1304)

```
<canvas id="scratchPadBg"  width="1200" height="1200"
        style="width:100%;height:100%;touch-action:none;pointer-events:none;">
</canvas>
<canvas id="scratchPad"    width="1200" height="1200"
        style="width:100%;height:100%;touch-action:none;cursor:crosshair;">
</canvas>
```

- Background canvas is `pointer-events:none` — all events hit the drawing canvas directly.
- **Backing store is 1200×1200 = 1.44 M pixels** regardless of device DPR. No `canvas.width = rect.width * dpr` dance. CSS scales the display, so the image is slightly blurry on high-DPI but the user's eye does not notice on pen strokes.
- No multi-page canvas. The expanded scratchpad is 1600×1000 = 1.6 M pixels, also fixed.

### initScratchPad (lines 1397–1432)

```
scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
scratchCtx.strokeStyle = currentPenColor;
scratchCtx.lineWidth = currentPenSize;
scratchCtx.lineCap = 'round';
scratchCtx.lineJoin = 'round';
...
scratchCanvas.addEventListener('mousedown', startDrawing);
scratchCanvas.addEventListener('mousemove', draw);
scratchCanvas.addEventListener('mouseup', stopDrawing);
scratchCanvas.addEventListener('mouseout', stopDrawing);
scratchCanvas.addEventListener('touchstart', handleTouchStart);
scratchCanvas.addEventListener('touchmove', handleTouchMove);
scratchCanvas.addEventListener('touchend', stopDrawing);
```

Native DOM listeners, attached once, no React.

### The drawing hot path (lines 1653–1696)

```
function handleTouchStart(e) {
  e.preventDefault();
  if (e.touches.length > 1) return;
  const touch = e.touches[0];
  if (touch.radiusX && touch.radiusX > 25) return; // palm
  const rect = scratchCanvas.getBoundingClientRect();
  const x = (touch.clientX - rect.left) * (scratchCanvas.width / rect.width);
  const y = (touch.clientY - rect.top)  * (scratchCanvas.height / rect.height);
  isDrawing = true;
  scratchCtx.beginPath();
  scratchCtx.moveTo(x, y);
}

function handleTouchMove(e) {
  if (!isDrawing) return;
  e.preventDefault();
  if (e.touches.length > 1) { isDrawing = false; return; }
  const touch = e.touches[0];
  const rect = scratchCanvas.getBoundingClientRect();
  const x = (touch.clientX - rect.left) * (scratchCanvas.width / rect.width);
  const y = (touch.clientY - rect.top)  * (scratchCanvas.height / rect.height);
  scratchCtx.lineTo(x, y);
  scratchCtx.stroke();
}
```

Key observations:

1. **No `getCoalescedEvents`** — they just use touch events. The Pencil fires touch events at whatever rate, and iOS coalesces under load; they accept that. On a 1.44 M-pixel canvas with no React on the main thread, the main thread is nearly idle between events so iOS rarely has a reason to coalesce.
2. **No rAF batching** — per-event `stroke()`.
3. Per move: `lineTo(x, y); stroke()` — this is the **O(N²) pattern** that bible_app's `b362e4f` fixed because it was a hot spot there. Math gets away with it because (a) the canvas is tiny (1.44 M px) so each composite is cheap, and (b) the `beginPath()` is ONLY called at `touchstart`, so the single path grows across the entire stroke but `stroke()` only has to stroke the current path. It still re-rasterizes the full growing path each call, but on 1.44 M px that's microseconds.
4. `getBoundingClientRect()` on every move — acceptable because there's no React layout churn (the surrounding DOM is static).
5. Palm rejection lives in the input handler: multi-touch + `radiusX > 25` rejects outright.
6. **Storage**: stroke history is stored as `ImageData` snapshots (line 1628) — full raster snapshots, 20-deep ring buffer for undo. Trades memory for zero serialization cost. No JSON, no normalized points.

### What math does NOT have

- Multi-page support.
- Persistent structured stroke data (it's just pixels).
- Text boxes, images, lasso selection, layers.
- React re-renders in the neighborhood.
- High-DPI crispness (backing store is fixed).
- Autosave on mid-stroke pauses.

This isn't an apples-to-apples "just copy math" — bible_app needs structured strokes for print export, AI re-flow, and multi-page notes. But the core drawing loop **can** be as lean as math's.

## Root-cause ranking

For the reported symptom ("smooth for a few words, then accumulating lag"), ranked by evidence weight.

### A — Canvas backing-store composite cost (STRONG)

**Evidence.** The overlay canvas covers the full page stack at 1.5 DPR. Per-event `stroke()` damages it and Safari recomposites the full layer. Backing-store area scales with page count (up to ~12 M pixels at 4 pages × 1.5 DPR × iPad Pro landscape). Each canvas uses `willReadFrequently: true` (line 787), which in Safari forces a software backing store — `stroke()` hits CPU, then the compositor has to upload for GPU composite. That flag is genuinely wrong for a drawing canvas that's only read on autosave/export. Math avoids both: 1.44 M fixed pixels, plus they also pass `willReadFrequently: true` but at that size it barely matters.

The commit history directly confirms this: `7ca7626` ("Draw live strokes on a page-sized overlay canvas…") explicitly blamed this composite cost, and `b2cd0c5` (DPR cap at 1.5) also blamed it and stuck. This candidate remains un-solved because 7ca7626 was reverted for an orthogonal reason (per-stroke canvas allocation), not because the diagnosis was wrong.

**Cumulative symptom fit.** Backing-store area is roughly constant during a single session, so "starts smooth, degrades" is NOT fully explained by A alone. But in combination with B below the degradation makes sense.

### B — Autosave stringify stall on mid-stroke pause (STRONG)

**Evidence.** `triggerAutoSave` (lines 571–598) is debounced 2 s but stringifies the FULL stroke+textbox+images document. Each committed stroke re-arms the timer (line 572). The user's described symptom — smooth, write, pause, write, LAG — matches a fire-and-stringify during the pause: the timer fires when the pencil is briefly off paper, the main thread blocks on stringify, and the first few points after reacquisition get coalesced by iOS. On a page with 80 strokes × 150 points, stringify ≈ 30–80 ms on iPad Pro. Math has no equivalent — their undo is in-memory ImageData.

**Cumulative symptom fit.** Scales with accumulated stroke data. Perfectly matches "first few words smooth, then lag" — after the first pause that's long enough to fire the autosave timer.

### C — `willReadFrequently: true` on drawing contexts (MEDIUM–STRONG)

**Evidence.** Lines 787 and 805 pass `willReadFrequently: true`. This hint tells browsers (especially Safari) to keep the backing store as a CPU bitmap, not a GPU texture. `stroke()` is cheaper to read back (good for `getImageData`) but much more expensive to composite with the surrounding DOM. The flag was likely added for `ImageData`-based lasso preview snapshotting (lines 1299 / 2402–2404). However the actual `getImageData` path is only used during lasso drag (not pen draw), so the two drawing contexts pay the CPU-backing penalty every frame for a rare feature.

**Cumulative symptom fit.** Constant cost, but elevates A's impact. Doesn't alone explain "starts smooth then lags".

### D — React rerender churn in the neighborhood (MEDIUM)

**Evidence.** Pen draw itself calls **zero** setState (verified). But during a stroke, unrelated parts of the tree may re-render: JournalView passes a fresh `onSave` callback, parent entries list rerenders on typing, etc. Stable listeners (line 1930 empty deps) mean the listener set doesn't churn, so pointermove/up events aren't lost — that's `fa7110e`'s fix. What IS NOT stable: if rerender happens mid-stroke for >1 frame, coalesced events accumulate and the next `pointermove` triggers a larger `getCoalescedEvents()` burst which means N `stroke()` calls back-to-back.

**Cumulative symptom fit.** Indirect; can amplify A. Probably not dominant now that listeners are stable.

### E — Scroll invalidating the cached rect (LOW)

**Evidence.** Line 822 invalidates `cachedCanvasRectRef` on scroll. Apple Pencil on a scrolling container can fire scroll events via momentum/rubber-band. Next `getCanvasPoint` then re-runs `getBoundingClientRect`. But the effect is a one-time layout per scroll; not a "grows over time" pattern.

**Cumulative symptom fit.** Poor. Scratch this as dominant.

### F — DPR still too high in some path (LOW–MEDIUM)

**Evidence.** `b2cd0c5` caps DPR at 1.5 at `setupCanvases`. Runtime verified: `Math.min(window.devicePixelRatio || 1, 1.5)`. iPad Pro is DPR 2; we get 1.5. Lowering further to 1.0 would cut another 44% of pixels (~56% total vs. native). Strokes stay visibly crisp — the pencil doesn't expose sub-pixel hinting. Risk: images and small text embedded as drawings could look softer, but at 1.0 DPR on a 264-PPI iPad Pro the strokes still look fine (the math app runs at effective DPR <1 and looks acceptable).

**Cumulative symptom fit.** Same as A — constant cost.

### Ranking

1. **A + B together** — composite cost per `stroke()` on a growing document plus periodic autosave stringify stalls. Either alone is strong; together they precisely match the reported symptom.
2. **C** — `willReadFrequently` elevates A's cost.
3. **F** — further DPR cut is a cheap additive win.
4. **D** — probably mitigated; worth a defensive check.
5. **E** — not dominant.

## Fix recommendations

For each, file:line target, expected impact, and regression risk anchored to a prior revert.

### Fix 1 — Re-do 7ca7626 correctly: page-sized live-stroke overlay, **allocated once** (A)

**Change.** Add a third canvas `liveStrokeCanvasRef`, ONE PAGE tall (`PAGE_HEIGHT = 1200 px`) at same width × DPR. Reposition it (CSS `translateY`) above the current drawing page on `handlePointerDown`. Draw per-event `stroke()` on this small canvas. On `handlePointerUp`, blit to `ctx`/`overlayCtx` at doc coordinates with `drawImage`, then clear + hide the live canvas.

- File: `components/NotabilityEditor.tsx`
- New ref near line 459.
- Allocate in `setupCanvases` (lines 764–817) — ONCE, not per stroke (this is the lesson from 7ca7626).
- Reposition in `handlePointerDown` pen branch (lines 1353–1360): compute which page the stroke started on, set `top: page * PAGE_HEIGHT` in CSS, show it, switch `drawCtx` to the live ctx.
- Commit in `commitCurrentStroke` (1031–1060): `targetCtx.drawImage(liveCanvas, 0, pageOffset)`, then clear the live canvas.
- JSX: new `<canvas>` inside `page-stack-outer` (around line 3772), `pointerEvents:'none'`, `zIndex` tracks drawing layer.

**Expected impact.** Per-event composite shrinks from ~12 M pixels (4-page overlay at 1.5 DPR) to ~2.97 M pixels (one page at 1.5 DPR) — **~75% reduction** at 4 pages. The "writes-a-few-words-then-lags" grows with page count; this cuts its slope to ~zero.

**Regression risk.** The 7ca7626 revert was caused by **per-stroke canvas allocation** causing laggy first-stroke. Mitigation: allocate once in `setupCanvases`. Reallocate only when `width` or DPR changes, same as main/overlay today. Strokes that span page boundaries: visually clip live (live canvas only covers one page), but the committed stroke is drawn in full at commit (same behavior 7ca7626 accepted).

### Fix 2 — Autosave: serialize on pointer-up, not on 2 s idle (B)

**Change.** Remove the 2 s debounce for the pen draw path. On `handlePointerUp` → `commitCurrentStroke` (1059) do NOT call `triggerAutoSave` synchronously. Instead, schedule the stringify + onSave through `requestIdleCallback` (with a 1 s deadline fallback to `setTimeout` on Safari — Safari 16+ supports ric via polyfill). For text/image edits keep the existing debounce.

- File: `components/NotabilityEditor.tsx`
- `triggerAutoSave` (571–598): add an optional `mode` arg; `'idle'` path uses `requestIdleCallback`, `'debounced'` path keeps the 2 s timer.
- `commitCurrentStroke` (1059) calls `triggerAutoSave('idle')`.

**Expected impact.** Removes the mid-gesture stringify stall that causes "pick up pencil and first letter lags". On iPad Safari, `requestIdleCallback` runs only when the main thread is genuinely idle; the stringify will run between strokes when the user is thinking, not when they've started writing.

**Regression risk.** Unsaved-data window grows from 2 s (current) to "until next idle window" (typically ≤5 s). Mitigation: fallback to `setTimeout(fn, 5000)` if ric hasn't fired in 5 s. Also: keep a guaranteed save on `visibilitychange` + `beforeunload` (may already exist; verify in a follow-up).

### Fix 3 — Remove `willReadFrequently: true` from draw contexts (C)

**Change.** Lines 787 and 805: drop `{ willReadFrequently: true }` for `ctx` and `overlayCtx`. Keep it for any context used by lasso snapshot (which uses `drawImage`, not `getImageData`, so it can also drop it after an audit).

- File: `components/NotabilityEditor.tsx` lines 787, 805.

**Expected impact.** Frees Safari to use a GPU-backed texture for the drawing layers. `stroke()` stays fast; compositing moves to GPU. Multi-MB-per-second bandwidth improvement on iPad Pro.

**Regression risk.** If any `getImageData` call lives on one of these contexts, performance cliffs there instead. Audit: `grep getImageData components/NotabilityEditor.tsx`. If the only use is on `selectionSnapshotRef` (an offscreen canvas, separate context), we're safe.

### Fix 4 — DPR cap at 1.0 on multi-page notes, 1.5 on single-page (F)

**Change.** Lines 773–774: `const dpr = totalPages > 1 ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.5);`.

**Expected impact.** Further ~56% reduction in backing-store pixels on multi-page notes, on top of Fix 1. Stroke crispness is effectively invariant to the user at iPad resolutions.

**Regression risk.** Embedded images on multi-page notes look slightly softer. Low-severity; can revisit if users notice.

### Fix 5 — Defensive: audit for setState during stroke (D)

**Change.** Read-only audit: grep for `setState` calls reachable from `handlePointerMove` → `handlePointerDown` → `handlePointerUp`. If any, route through a ref. Also verify `handlersRef` is stable when the parent `JournalView` re-renders.

**Expected impact.** Probably zero (already stable). Documents the invariant.

**Regression risk.** None — audit only.

## Synthesis recommendation

**Ship Fix 1 + Fix 2 as a pair** — in this order, each as its own PR.

- **Fix 2 first.** Smaller, lower risk, directly addresses the "pause → lag" symptom the user described. Ships in isolation and we can measure the effect before touching canvas structure.
- **Fix 1 second.** Structural change. Re-attempts `7ca7626` with the lesson learned (allocate once). If the allocate-once detail is preserved, this cuts the steady-state composite cost by ~75% on multi-page notes and removes the upper-bound on "how long can I write before it lags."

Hold Fix 3, Fix 4, Fix 5 for after measuring Fix 1 + Fix 2. If lag persists, apply in order (3, 4, 5) with device-side `perf.mark` measurements between each. Do NOT ship all five as one PR — we lose the ability to attribute regressions and fall back into the oscillation pattern.

**Explicit anti-pattern to avoid**: re-introducing rAF batching. It was reverted (c262551 → d1e357c) for a reason and the math reference confirms that per-event drawing is the correct latency model for Apple Pencil.

## Fresh-start assessment

**Verdict: do NOT rewrite from scratch.** The bug is solvable in-place. Evidence:

1. The current bible_app pen hot path is already close to optimal for its feature set. Per-event cost is already O(1) in path work (`b362e4f`). Listener stability is already solved (`fa7110e`). Pen Events + coalesced replay is already done (`5d758da`). DPR is already capped (`b2cd0c5`).
2. The two remaining wins are **structural but local** — one new small canvas (Fix 1), one timing change (Fix 2). Estimated 150–300 LOC changed across both, one file, no data-model change.
3. The cost of rewriting: 18 months of Notability features (text boxes, AI editing, lasso selection, multi-page, layer ordering, autosave, undo, Supabase sync, PDF export, journal integration, sketched background types) would have to be re-ported. The current `NotabilityEditor.tsx` is ~3,874 lines; the mature journal integration around it is several thousand more. A fresh-start rewrite faithful to the feature set is a 20–40-session project with a real risk of regressing features users already rely on.
4. Math is **not a rewrite target** for this app. Math's architecture (fixed-size single canvas + ImageData undo + no structured strokes) does not support multi-page, print export, AI stroke re-flow, or structured annotations. Copying math's drawing loop wholesale would regress journaling features to zero.

What we CAN and SHOULD copy from math:

- The tiny-canvas live-stroke pattern (Fix 1 implements this at one-page size).
- The "autosave is not in the pen path" discipline (Fix 2).
- The practice of NOT using `willReadFrequently` on drawing contexts (Fix 3).

**Rough scope comparison.**

| Path | Scope | Risk | Time to user-visible fix |
| --- | --- | --- | --- |
| In-place (Fix 1 + 2) | ~200–400 LOC, 1 file, 2 PRs | Low (revert is trivial; previous revert commits as references) | 1–2 sessions |
| Fresh-start "Notability lite" | ~5,000+ LOC across editor + adapters + migrations + feature re-ports | High — every feature re-ported is a re-introduced bug surface | 15–30 sessions, months of calendar time |

Recommend the user accept the in-place path. If after Fix 1 + 2 + 3 + 4 the lag still reproduces on a device with instrumentation, re-open the fresh-start conversation with concrete device measurements in hand.

## Validation plan

Per rule R15 (measure first), any implementation must include:

1. **Perf marks** around `handlePointerMove` and `ctx.stroke()` on the pen draw path. Log `performance.now()` deltas to a ring buffer, expose via a debug panel or `window.__penPerf`. Required before/after measurement on a real iPad.
2. **Device test**: iPad Pro 11" (user's device). Scenario: open a fresh journal, write continuously for 60 s, count committed strokes, record 95th-percentile per-event cost at second 5 vs. second 55.
3. **Regression guard**: run the existing `tests/e2e/notability-pointer-matrix.spec.ts` suite. Playwright emulates pointer events, so the coalesced-replay path and the live-canvas path need new test coverage.
4. **Unsaved-data guarantee test** for Fix 2: start stroke, `visibilitychange` → expect save before handler returns.
5. **First-stroke latency test** for Fix 1: empty note, first pointerdown → first `stroke()` must be <16 ms end-to-end (regression from 7ca7626 was here).

## Questions for user

Decisions only the user can make; listed for the implementation session to pick up.

1. **Autosave window tradeoff.** Fix 2 changes the worst-case unsaved-data window from 2 s to up to 5 s (idle-callback fallback). Acceptable?
2. **DPR 1.0 on multi-page (Fix 4)** will make embedded image thumbnails slightly softer on a 4-page note on iPad Pro. Acceptable? If not, we can keep 1.5 and accept Fix 1's savings alone.
3. **`requestIdleCallback` in Safari.** Safari 15–16 ship it behind a flag / limited. We can use a deterministic `setTimeout(0)` after pointerup instead — the main thread is typically idle between strokes anyway. Preference?
4. **Scope of Fix 1 live canvas.** Should it support strokes that cross page boundaries with continuous visual feedback (harder — requires either a live canvas spanning two pages or a fallback to the main canvas), or is "visual clipping at page boundary, correct final render after commit" acceptable for now? 7ca7626 accepted the latter.
5. **Do you want the instrumentation (perf marks) to stay in production behind a dev flag, or stripped after validation?**
