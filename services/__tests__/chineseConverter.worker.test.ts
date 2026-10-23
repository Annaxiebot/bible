/**
 * Worker-backed converter paths (2026-10 review): concurrent requests for the
 * same text share one worker round-trip, and the main-thread fallback (worker
 * construction failure or crash) notifies sync-only renderers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Mode = 'reply' | 'crash' | 'throw';
let mode: Mode = 'reply';
let posts: Array<{ id: number; type: string; text?: string }> = [];

class FakeWorker {
  private listeners: Record<string, Array<(e: unknown) => void>> = { message: [], error: [] };
  constructor() {
    if (mode === 'throw') throw new Error('Worker construction failed');
  }
  addEventListener(type: string, fn: (e: unknown) => void) { this.listeners[type]?.push(fn); }
  postMessage(msg: { id: number; type: string; text?: string }) {
    posts.push(msg);
    setTimeout(() => {
      if (mode === 'crash') {
        for (const fn of this.listeners.error) fn(new Event('error'));
      } else if (msg.type === 'preload') {
        for (const fn of this.listeners.message) fn({ data: { id: msg.id, ready: true } });
      } else {
        for (const fn of this.listeners.message) fn({ data: { id: msg.id, result: `[${msg.type}]${msg.text}` } });
      }
    }, 0);
  }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function freshConverter() {
  vi.resetModules();
  return import('../chineseConverter');
}

beforeEach(() => {
  mode = 'reply';
  posts = [];
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('chineseConverter — in-flight dedupe', () => {
  it('concurrent sync and async requests for the same text post once', async () => {
    const c = await freshConverter();
    expect(c.toSimplified('聖經')).toBe('聖經');
    expect(c.toSimplified('聖經')).toBe('聖經');
    const results = await Promise.all([c.toSimplifiedAsync('聖經'), c.toScriptAsync('聖經', true)]);
    expect(c.toSimplified('聖經')).toBe('[toSimp]聖經');
    expect(results).toEqual(['[toSimp]聖經', '[toSimp]聖經']);
    expect(posts.filter(p => p.type === 'toSimp' && p.text === '聖經')).toHaveLength(1);
  });

  it('the direction is part of the key', async () => {
    const c = await freshConverter();
    await Promise.all([c.toSimplifiedAsync('經'), c.toTraditionalAsync('經')]);
    expect(posts.filter(p => p.text === '經').map(p => p.type).sort()).toEqual(['toSimp', 'toTrad']);
  });
});

describe('chineseConverter — main-thread fallback notifies', () => {
  it('when the worker cannot be constructed', async () => {
    mode = 'throw';
    const c = await freshConverter();
    await c.toSimplifiedAsync('書'); // load the dictionary first (its own notification)
    await tick();
    const listener = vi.fn();
    c.subscribeConverter(listener);
    expect(c.toSimplified('聖經')).toBe('聖經');
    await c.toSimplifiedAsync('聖經');
    await tick();
    expect(listener).toHaveBeenCalled();
    expect(c.toSimplified('聖經')).toBe('圣经');
  });

  it('when the worker crashes mid-request', async () => {
    mode = 'crash';
    const c = await freshConverter();
    await c.toSimplifiedAsync('書');
    await tick();
    const listener = vi.fn();
    c.subscribeConverter(listener);
    expect(await c.toSimplifiedAsync('聖經')).toBe('圣经');
    await tick();
    expect(listener).toHaveBeenCalled();
  });
});
