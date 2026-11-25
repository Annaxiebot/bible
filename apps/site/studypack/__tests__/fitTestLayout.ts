/**
 * fitTestLayout.ts — the ONE overflow model for fit-scale tests · 适配测试布局模型
 *
 * contentOverflows reads the AREA's scrollHeight (ADR-0028). jsdom computes
 * no layout, so the fit tests model a scroll box the way Chromium reports
 * one: scrollHeight = max(the box's own height, its content's height —
 * child margins included). One definition, shared by fitScale.test.ts,
 * useFitScale.test.tsx and useAnswerFit.test.tsx (R3).
 */
export function modelAreaScrollHeight(area: HTMLElement, contentHeight: () => number): void {
  Object.defineProperty(area, 'scrollHeight', {
    configurable: true,
    get: () => Math.max(area.clientHeight, contentHeight()),
  });
}
