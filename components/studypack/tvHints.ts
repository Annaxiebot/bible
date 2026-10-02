/**
 * tvHints.ts — user-facing hint strings for TV presentation mode.
 *
 * Single source (R3): the view renders these and the unit + e2e tests
 * import them, so the on-screen hint can never drift from the behavior
 * the tests pin. Pure module (no React) so Playwright specs can import it.
 */

/** First-slide navigation hint: arrows / swipe, select-to-ask, A, Esc. */
export const FIRST_SLIDE_HINT =
  '← → 或滑动翻页 · Arrow keys or swipe · 选中文字或按 A 问AI · Select text or press A to ask AI · Esc 退出';
