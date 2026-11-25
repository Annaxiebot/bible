/**
 * chineseDictionary.ts — loads one OpenCC direction at a time · 简繁词典按需加载
 *
 * opencc-js's full bundle holds both directions: 1,112 KB (482 KB gzip), and
 * every reader downloaded it at start-up. Split by direction (2026-10-23,
 * option A of the earlier measurement):
 *   toSimp 繁→简, opencc-js/t2cn:    62 KB (38 KB gzip) — 简 readers, and search;
 *   toTrad 简→繁, opencc-js/cn2t: 1,053 KB (447 KB gzip) — on the first 繁 request.
 * Each context that converts (the worker, and the main-thread fallback in
 * chineseConverter.ts) makes its own loader.
 */
export type ConvertDirection = 'toSimp' | 'toTrad';
export type Convert = (text: string) => string;

/** A loader that imports each direction's dictionary on first use, once (a failed import is retried next time). */
export function createDictionaryLoader(): (direction: ConvertDirection) => Promise<Convert> {
  const loading = new Map<ConvertDirection, Promise<Convert>>();
  return (direction) => {
    const existing = loading.get(direction);
    if (existing) return existing;
    const promise: Promise<Convert> = direction === 'toSimp'
      ? import('opencc-js/t2cn').then(m => m.Converter({ from: 'tw', to: 'cn' }))
      : import('opencc-js/cn2t').then(m => m.Converter({ from: 'cn', to: 'tw' }));
    loading.set(direction, promise);
    // The caller sees the rejection; forgetting it here only lets the next request try again (e.g. back online).
    promise.catch(() => { loading.delete(direction); });
    return promise;
  };
}
