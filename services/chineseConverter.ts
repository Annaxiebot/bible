/**
 * Chinese Character Converter
 *
 * Converts between Traditional Chinese (CUV Bible text uses Taiwan/HK standard)
 * and Simplified Chinese using the opencc-js library, which implements the full
 * OpenCC dictionary (~7,000+ character mappings vs the previous 291-entry table).
 *
 * The opencc-js dictionary (~1MB) lives in a Web Worker so loading and
 * conversion never block the UI thread. A small LRU cache keeps recently
 * converted strings around so that hot-path (render) sync callers get the
 * correct result instantly on repeat calls.
 *
 * Locales used:
 *   tw → cn  : Traditional (Taiwan) to Simplified
 *   cn → tw  : Simplified to Traditional (Taiwan)
 */

const CACHE_LIMIT = 1000;

// LRU cache: re-inserting a key moves it to the most-recent position.
const simpCache = new Map<string, string>();
const tradCache = new Map<string, string>();

function cacheGet(cache: Map<string, string>, key: string): string | undefined {
  const v = cache.get(key);
  if (v !== undefined) {
    // Bump to most-recent.
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}

function cacheSet(cache: Map<string, string>, key: string, value: string): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) {
    // Evict oldest.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

// --- Worker-backed path (browser) ---

interface PendingRequest {
  resolve: (value: string | void) => void;
  reject: (err: unknown) => void;
  type: 'toSimp' | 'toTrad' | 'preload';
  text?: string;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();
let workerReady = false;
let workerReadyPromise: Promise<void> | null = null;

// --- Test / no-Worker path (jsdom, Node) ---

let syncToSimp: ((text: string) => string) | null = null;
let syncToTrad: ((text: string) => string) | null = null;
let syncLoadPromise: Promise<void> | null = null;

function ensureSyncLoaded(): Promise<void> {
  if (syncToSimp && syncToTrad) return Promise.resolve();
  if (!syncLoadPromise) {
    syncLoadPromise = import('opencc-js').then((opencc) => {
      syncToSimp = opencc.Converter({ from: 'tw', to: 'cn' });
      syncToTrad = opencc.Converter({ from: 'cn', to: 'tw' });
    });
  }
  return syncLoadPromise;
}

function workerAvailable(): boolean {
  return typeof Worker !== 'undefined';
}

function getWorker(): Worker | null {
  if (!workerAvailable()) return null;
  if (worker) return worker;
  try {
    worker = new Worker(
      new URL('./chineseConverter.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { id: number; result?: string; ready?: true };
      const req = pending.get(data.id);
      if (!req) return;
      pending.delete(data.id);
      if (data.ready) {
        workerReady = true;
        req.resolve();
        return;
      }
      if (typeof data.result === 'string') {
        // Populate caches so subsequent sync callers get an instant hit.
        if (req.type === 'toSimp' && req.text !== undefined) {
          cacheSet(simpCache, req.text, data.result);
        } else if (req.type === 'toTrad' && req.text !== undefined) {
          cacheSet(tradCache, req.text, data.result);
        }
        req.resolve(data.result);
      }
    });
    worker.addEventListener('error', (e) => {
      // Reject everything outstanding on a worker error, then tear it down.
      for (const req of pending.values()) req.reject(e);
      pending.clear();
      worker = null;
      workerReady = false;
      workerReadyPromise = null;
    });
  } catch {
    worker = null;
  }
  return worker;
}

function postToWorker(
  type: 'toSimp' | 'toTrad',
  text: string,
): Promise<string> {
  const w = getWorker();
  if (!w) return Promise.resolve(text);
  return new Promise<string>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, {
      resolve: (v) => resolve(typeof v === 'string' ? v : text),
      reject,
      type,
      text,
    });
    w.postMessage({ id, type, text });
  });
}

/** Convert Traditional Chinese to Simplified (async, worker-backed). */
export const toSimplifiedAsync = async (text: string): Promise<string> => {
  if (!text) return text;
  const cached = cacheGet(simpCache, text);
  if (cached !== undefined) return cached;
  if (!workerAvailable()) {
    await ensureSyncLoaded();
    const result = syncToSimp!(text);
    cacheSet(simpCache, text, result);
    return result;
  }
  return postToWorker('toSimp', text);
};

/** Convert Simplified Chinese to Traditional (async, worker-backed). */
export const toTraditionalAsync = async (text: string): Promise<string> => {
  if (!text) return text;
  const cached = cacheGet(tradCache, text);
  if (cached !== undefined) return cached;
  if (!workerAvailable()) {
    await ensureSyncLoaded();
    const result = syncToTrad!(text);
    cacheSet(tradCache, text, result);
    return result;
  }
  return postToWorker('toTrad', text);
};

/**
 * Convert Traditional → Simplified (sync).
 *
 * Returns instantly from cache if available. Otherwise kicks off an async
 * conversion in the worker (to populate the cache) and returns the original
 * text as a best-effort fallback. In environments without Worker support
 * (tests, Node) and where the dictionary has been loaded synchronously, it
 * returns the real conversion.
 */
export const toSimplified = (text: string): string => {
  if (!text) return text;
  const cached = cacheGet(simpCache, text);
  if (cached !== undefined) return cached;
  if (!workerAvailable() && syncToSimp) {
    const result = syncToSimp(text);
    cacheSet(simpCache, text, result);
    return result;
  }
  // Kick off background conversion so repeat calls hit cache.
  void toSimplifiedAsync(text);
  return text;
};

/**
 * Convert Simplified → Traditional (sync). See {@link toSimplified} for
 * semantics.
 */
export const toTraditional = (text: string): string => {
  if (!text) return text;
  const cached = cacheGet(tradCache, text);
  if (cached !== undefined) return cached;
  if (!workerAvailable() && syncToTrad) {
    const result = syncToTrad(text);
    cacheSet(tradCache, text, result);
    return result;
  }
  void toTraditionalAsync(text);
  return text;
};

/** Pre-load the converter dictionary (call on app init or when simplified mode turns on). */
export const preloadConverter = (): Promise<void> => {
  if (!workerAvailable()) return ensureSyncLoaded();
  if (workerReady) return Promise.resolve();
  if (workerReadyPromise) return workerReadyPromise;
  const w = getWorker();
  if (!w) return ensureSyncLoaded();
  workerReadyPromise = new Promise<void>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, {
      resolve: () => resolve(),
      reject,
      type: 'preload',
    });
    w.postMessage({ id, type: 'preload' });
  });
  return workerReadyPromise;
};
