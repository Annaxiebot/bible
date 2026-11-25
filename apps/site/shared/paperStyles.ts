/**
 * paperStyles.ts — classes of the member pages on paper · 纸面页样式
 *
 * One source (R3) for the sign-up, check-in, stop and QR pages, which follow
 * the landing's style (2026-10-04): paper background, ink text, Chinese
 * headings in 霞鹜文楷 LXGW WenKai bold (.stl-head), sans body ≥ 20px
 * (.stl-paper-page, styles/stlShared.css), gold pills (Pill.tsx). Colours
 * are stl-* tokens only (stlTheme.test.ts scans the pages). Type sizes stay
 * in newStudyStyles (textStyle ≥ 20px, controlStyle ≥ 48px targets).
 */

/** The full-screen page: its own scroll container (body is overflow:hidden app-wide). */
export const PAPER_PAGE_CLASS = 'stl-paper-page fixed inset-0 overflow-y-auto overflow-x-hidden bg-stl-paper text-stl-ink';
/** The readable column inside it. */
export const PAPER_COLUMN_CLASS = 'mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:px-6';
/** h1 / h2 / legend: Latin in Fraunces, Chinese in WenKai bold. */
export const PAPER_HEAD_CLASS = 'stl-head text-stl-ink';
/** Secondary lines: intros, labels, hints. */
export const PAPER_MUTED_CLASS = 'text-stl-ink-2';
/** Small gold text on paper (passage refs, chosen practices): gold-deep is ≥ 4.5:1 there. */
export const PAPER_ACCENT_CLASS = 'text-stl-gold-deep';
export const PAPER_ERROR_CLASS = 'text-red-700';
export const PAPER_OK_CLASS = 'text-emerald-800';
export const PAPER_LINK_CLASS = 'text-stl-ink-2 underline underline-offset-4 hover:text-stl-gold-deep';
export const PAPER_CARD_CLASS = 'rounded-2xl border-2 border-stl-gold-deep bg-stl-card p-6';
export const PAPER_INPUT_CLASS =
  'w-full rounded-xl border-2 border-stl-line bg-stl-card px-4 py-2 text-stl-ink focus:border-stl-gold-deep focus:outline-none';
export const PAPER_LABEL_CLASS = 'flex flex-col gap-2 text-stl-ink-2';
