/**
 * memoryStorage.ts — make the test localStorage actually store values.
 *
 * tests/utils/setup.ts defines window.localStorage (non-configurable) as an
 * object of no-op vi.fn()s, so a value written there reads back undefined.
 * Tests of preference persistence call installMemoryStorage() in beforeEach:
 * it backs those same mocks with a fresh Map (calls stay inspectable).
 */
import { vi } from 'vitest';

export function installMemoryStorage(): Map<string, string> {
  const map = new Map<string, string>();
  const ls = window.localStorage;
  vi.mocked(ls.getItem).mockImplementation((key: string) => (map.has(key) ? map.get(key)! : null));
  vi.mocked(ls.setItem).mockImplementation((key: string, value: string) => { map.set(key, String(value)); });
  vi.mocked(ls.removeItem).mockImplementation((key: string) => { map.delete(key); });
  vi.mocked(ls.clear).mockImplementation(() => { map.clear(); });
  vi.mocked(ls.key).mockImplementation((i: number) => [...map.keys()][i] ?? null);
  return map;
}
