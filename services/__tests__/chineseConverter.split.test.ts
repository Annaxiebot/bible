/**
 * OpenCC split by direction (2026-10-23): a 简 reader loads only opencc-js/t2cn
 * (38 KB gzip); the 1 MB opencc-js/cn2t table loads on the first 繁 request.
 * Both places that load dictionaries are checked — the worker (the browser's
 * normal path) and the main-thread converter (no Worker, or a failed one) —
 * each with a control showing the 繁 side really does load cn2t, so "never
 * loaded" is not a vacuous pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { imports: [] as string[], failCn2t: false };

// Registered afresh for every test (vi.doMock after vi.resetModules), so each factory run is one real
// import of that dictionary by the code under test — a hoisted vi.mock factory runs once per file.
function mockDictionaries() {
  vi.doMock('opencc-js/t2cn', async () => {
    state.imports.push('t2cn');
    return vi.importActual<typeof import('opencc-js/t2cn')>('opencc-js/t2cn');
  });
  vi.doMock('opencc-js/cn2t', async () => {
    state.imports.push('cn2t');
    const actual = await vi.importActual<typeof import('opencc-js/cn2t')>('opencc-js/cn2t');
    return {
      ...actual,
      Converter: (options: { from: string; to: string }) => {
        if (state.failCn2t) throw new Error('dictionary unavailable');
        return actual.Converter(options);
      },
    };
  });
}

beforeEach(() => {
  state.imports = [];
  state.failCn2t = false;
  vi.resetModules();
  mockDictionaries();
});

type Handler = (event: { data: unknown }) => Promise<void>;

/** Import the worker module afresh and drive its message handler directly; returns what it posts back. */
async function freshWorker() {
  const add = vi.spyOn(self, 'addEventListener');
  await import('../chineseConverter.worker');
  const handler = add.mock.calls.find(call => call[0] === 'message')![1] as unknown as Handler;
  add.mockRestore();
  const posted: unknown[] = [];
  const post = vi.spyOn(self, 'postMessage').mockImplementation(((message: unknown) => { posted.push(message); }) as unknown as typeof self.postMessage);
  return {
    async send(data: unknown) {
      await handler({ data });
      return posted.at(-1);
    },
    restore: () => post.mockRestore(),
  };
}

describe('the converter worker', () => {
  it('a 简 reader (preload + conversions) never loads cn2t; the first 繁 request does', async () => {
    const worker = await freshWorker();
    try {
      expect(await worker.send({ id: 1, type: 'preload', direction: 'toSimp' })).toEqual({ id: 1, ready: true });
      expect(await worker.send({ id: 2, type: 'toSimp', text: '聖經' })).toEqual({ id: 2, result: '圣经' });
      expect(state.imports).toEqual(['t2cn']);
      // Control: 繁 loads the 简→繁 table, once.
      expect(await worker.send({ id: 3, type: 'toTrad', text: '圣经' })).toEqual({ id: 3, result: '聖經' });
      expect(await worker.send({ id: 4, type: 'preload', direction: 'toTrad' })).toEqual({ id: 4, ready: true });
      expect(state.imports).toEqual(['t2cn', 'cn2t']);
    } finally {
      worker.restore();
    }
  });

  it('a dictionary that cannot load is reported back, not left pending', async () => {
    state.failCn2t = true;
    const worker = await freshWorker();
    try {
      expect(await worker.send({ id: 7, type: 'toTrad', text: '圣经' })).toEqual({ id: 7, error: 'dictionary unavailable' });
      expect(await worker.send({ id: 8, type: 'preload', direction: 'toTrad' })).toEqual({ id: 8, error: 'dictionary unavailable' });
      // 简 still works.
      expect(await worker.send({ id: 9, type: 'toSimp', text: '經' })).toEqual({ id: 9, result: '经' });
    } finally {
      worker.restore();
    }
  });
});

describe('the main-thread converter (no Worker)', () => {
  it('简 preload, async, sync and script calls never load cn2t; a 繁 preload does', async () => {
    expect(typeof Worker).toBe('undefined');
    const c = await import('../chineseConverter');
    await c.preloadConverter(true);
    expect(await c.toSimplifiedAsync('聖經')).toBe('圣经');
    expect(await c.toScriptAsync('書', true)).toBe('书');
    expect(c.toScript('愛', true)).toBe('爱');
    expect(state.imports).toEqual(['t2cn']);
    // Control.
    await c.preloadConverter(false);
    expect(c.toScript('爱', false)).toBe('愛');
    expect(state.imports).toEqual(['t2cn', 'cn2t']);
  });
});
