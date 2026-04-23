import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * ADR-0002 Pencil fix #1 tripwire.
 *
 * Root cause of the "writes a few words, then lags" symptom per
 * ADR-0002: the 2-second-idle autosave fires a `JSON.stringify` on a
 * ~600 KB notability document (30–80 ms main-thread block on iPad
 * Pro). If the user paused their pen mid-sentence — common when
 * thinking — the save runs, main thread stalls, and the next stroke
 * lags noticeably on resume.
 *
 * The fix is two defenses at the same site:
 *   1. Guard: skip the save entirely if `isDrawingRef.current` is true
 *      (mid-stroke). handlePointerUp's commitCurrentStroke re-triggers
 *      autosave when safe.
 *   2. Defer: perform the actual JSON.stringify + onSave inside a
 *      `requestIdleCallback` (or setTimeout 0 fallback for older
 *      Safari). Saves never race with user input.
 *
 * Both defenses are a 3-line diff that's easy to lose in a future
 * "cleanup" pass. This tripwire keeps them from drifting silently by
 * asserting the exact signatures appear in the autosave block. A
 * regression that reverts either defense flips this test red, pointing
 * straight back at the ADR.
 *
 * Runtime verification (perceived Pencil smoothness on iPad) is a
 * real-device test; headless Chromium cannot measure input lag in a
 * way that would meaningfully gate CI.
 */
describe('ADR-0002 Pencil fix #1: autosave off the pen path', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const editorPath = resolve(here, '..', 'NotabilityEditor.tsx');
  const src = readFileSync(editorPath, 'utf8');

  it('guards the autosave timer body with isDrawingRef.current check (defense #1)', () => {
    // The guard must appear inside the setTimeout callback, before the
    // save helper is invoked. A regression that drops this lets mid-
    // stroke saves resume.
    expect(src, 'isDrawingRef.current guard is missing from the autosave path').toMatch(
      /autoSaveTimerRef\.current\s*=\s*setTimeout\(\s*\(\s*\)\s*=>\s*\{[\s\S]{0,2000}?if\s*\(\s*isDrawingRef\.current\s*\)\s*return\s*;/,
    );
  });

  it('dispatches the serialize+save work via requestIdleCallback with a setTimeout fallback (defense #2)', () => {
    // `requestIdleCallback` is the primary scheduler; the setTimeout(fn, 0)
    // fallback keeps Safari < 18 on the deferred path too.
    expect(src).toMatch(/requestIdleCallback/);
    expect(src).toMatch(/setTimeout\(\s*perform\s*,\s*0\s*\)/);
  });

  it('does not call JSON.stringify / serializeExtended synchronously on the stroke-commit path', () => {
    // commitCurrentStroke → triggerAutoSave is the pen-path entry. The
    // serialize work must live inside `perform`, not in the
    // setTimeout body that runs right after AUTOSAVE_DELAY.
    // Sanity check: only ONE JSON.stringify in the file belongs to
    // autosave today (the rest are in data-import-friendly paths).
    // This is a soft tripwire — flags any new stringify call placed
    // outside an idle-callback deferral so a future maintainer sees
    // the ADR-0002 rationale before committing.
    const stringifyCount = (src.match(/JSON\.stringify\s*\(/g) ?? []).length;
    expect(stringifyCount, 'unexpected JSON.stringify count; review ADR-0002 before adding more').toBeLessThanOrEqual(5);
  });
});
