/**
 * Chinese Character Converter — Web Worker
 *
 * Hosts the opencc-js dictionaries off the main thread so that loading and
 * conversion never block UI work. Each direction loads on its first request
 * (services/chineseDictionary): a 简 reader never downloads the 简→繁 table.
 *
 * Message protocol:
 *   incoming: { id, type: 'toSimp' | 'toTrad', text } | { id, type: 'preload', direction: 'toSimp' | 'toTrad' }
 *   outgoing: { id, result } | { id, ready: true } | { id, error } (the dictionary could not load)
 */

/// <reference lib="webworker" />

import { createDictionaryLoader, type ConvertDirection } from './chineseDictionary';

type InMessage =
  | { id: number; type: ConvertDirection; text: string }
  | { id: number; type: 'preload'; direction: ConvertDirection };

type OutMessage =
  | { id: number; result: string }
  | { id: number; ready: true }
  | { id: number; error: string };

const load = createDictionaryLoader();
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', async (event: MessageEvent<InMessage>) => {
  const msg = event.data;
  let out: OutMessage;
  try {
    if (msg.type === 'preload') {
      await load(msg.direction);
      out = { id: msg.id, ready: true };
    } else {
      out = { id: msg.id, result: (await load(msg.type))(msg.text) };
    }
  } catch (err) {
    // Reported, not thrown: an unhandled rejection here would leave the caller waiting forever.
    out = { id: msg.id, error: err instanceof Error ? err.message : String(err) };
  }
  ctx.postMessage(out);
});

export {};
