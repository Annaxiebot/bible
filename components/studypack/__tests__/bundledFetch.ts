/**
 * bundledFetch.ts — serve the real bundled chapter files to fetch in jsdom · 测试用经文数据
 *
 * The citation check must judge against the actual public/bible-data files
 * (R14: no hand-written chapter that could agree with a wrong verdict).
 * A path that has no file answers 404, like the static host.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { vi } from 'vitest';

const PUBLIC_DIR = path.resolve(__dirname, '../../../public');

/** Stub global fetch with the bundled files; returns the mock to count calls. */
export function stubBundledFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    const at = String(url).indexOf('bible-data/');
    const file = at < 0 ? '' : path.join(PUBLIC_DIR, String(url).slice(at));
    if (!file || !existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(file, 'utf-8')) as unknown };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
