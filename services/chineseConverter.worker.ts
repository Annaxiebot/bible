/**
 * Chinese Character Converter — Web Worker
 *
 * Hosts the opencc-js dictionary (~1MB) off the main thread so that loading
 * and conversion never block UI work.
 *
 * Message protocol:
 *   incoming: { id: number, type: 'toSimp' | 'toTrad' | 'preload', text?: string }
 *   outgoing: { id: number, result?: string, ready?: true }
 */

/// <reference lib="webworker" />

type InMessage =
  | { id: number; type: 'toSimp'; text: string }
  | { id: number; type: 'toTrad'; text: string }
  | { id: number; type: 'preload' };

type OutMessage =
  | { id: number; result: string }
  | { id: number; ready: true };

let toSimp: ((text: string) => string) | null = null;
let toTrad: ((text: string) => string) | null = null;
let loadPromise: Promise<void> | null = null;

function ensureLoaded(): Promise<void> {
  if (toSimp && toTrad) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = import('opencc-js').then((opencc) => {
      toSimp = opencc.Converter({ from: 'tw', to: 'cn' });
      toTrad = opencc.Converter({ from: 'cn', to: 'tw' });
    });
  }
  return loadPromise;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', async (event: MessageEvent<InMessage>) => {
  const msg = event.data;
  await ensureLoaded();
  if (msg.type === 'preload') {
    const out: OutMessage = { id: msg.id, ready: true };
    ctx.postMessage(out);
    return;
  }
  const fn = msg.type === 'toSimp' ? toSimp! : toTrad!;
  const out: OutMessage = { id: msg.id, result: fn(msg.text) };
  ctx.postMessage(out);
});

export {};
