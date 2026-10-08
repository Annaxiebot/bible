/**
 * leaderTime.ts — short local times for the leader's sign-up page · 组长页时间
 *
 * The sign-up table and the shared-answer cards show a compact local time
 * ("10/6 15:12": month/day, 24-hour) that never wraps; the full locale
 * timestamp rides in the element's title tooltip. Pure functions (local
 * time zone of the browser); the tests pin them with a fixed Date.
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "M/D HH:mm" in the browser's local time, e.g. "10/6 15:12". */
export function compactTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** The full local timestamp, for the title tooltip. */
export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
