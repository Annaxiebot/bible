import { useEffect, useMemo, useReducer, useState } from 'react';
import { Verse } from '../types';
import { subscribeConverter, toScript, toScriptAsync } from '../services/chineseConverter';

/** Re-render the caller whenever the converter becomes ready or caches new conversions. */
export function useConverterUpdates(): number {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeConverter(bump), []);
  return version;
}

interface Converted {
  source: Verse[];
  simplified: boolean;
  verses: Verse[];
}

/**
 * The Chinese column in the chosen script. Bundled CUV is already Simplified and
 * API-cached text is Traditional, so both directions convert: the whole chapter
 * is converted asynchronously and swapped in together, and a result for an older
 * chapter or script is dropped (no mixing across chapters or a fast 繁/简 toggle).
 * Until it lands, verses come from the sync cache path (re-rendered on readiness).
 */
export function useChineseScript(verses: Verse[], simplified: boolean): { verses: Verse[]; pending: boolean } {
  const converterVersion = useConverterUpdates();
  const [converted, setConverted] = useState<Converted | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (verses.length === 0) return;
    Promise.all(verses.map(v => toScriptAsync(v.text, simplified)))
      .then(texts => {
        if (cancelled) return;
        setConverted({ source: verses, simplified, verses: verses.map((v, i) => ({ ...v, text: texts[i] })) });
      })
      .catch(() => {
        // Worker and main-thread fallback both failed: settle on this chapter's
        // original text rather than staying pending forever.
        if (cancelled) return;
        setConverted({ source: verses, simplified, verses });
      });
    return () => { cancelled = true; };
  }, [verses, simplified]);

  const ready = !!converted && converted.source === verses && converted.simplified === simplified;
  const fallback = useMemo(
    () => (ready ? null : verses.map(v => {
      const text = toScript(v.text, simplified);
      return text === v.text ? v : { ...v, text };
    })),
    // converterVersion: recompute when the sync cache gains results.
    [ready, verses, simplified, converterVersion],
  );
  if (ready) return { verses: converted!.verses, pending: false };
  return { verses: fallback!, pending: verses.length > 0 };
}
