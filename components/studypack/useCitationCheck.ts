/**
 * useCitationCheck.ts — check an answer's references once it is complete · 引用核对
 *
 * Runs citations.ts on the answer text only when `complete` is true (the
 * overlay passes false while tokens stream in), so a stream never triggers
 * a chapter load per token. Until the check settles — and for any ref it
 * cannot decide — the answer renders as before (every ref a popover).
 */
import { useEffect, useState } from 'react';
import { StudyPack } from './packTypes';
import { CitedRef, checkAnswerRefs, loadCitedRefs } from './citations';

export interface CitationCheck {
  /** Refs (as written) that do not exist: rendered plain with NO_SUCH_VERSE_MARK. */
  invalid: ReadonlySet<string>;
  /** The TV "verses cited" block entries (valid, outside the pack). */
  cited: CitedRef[];
}

/** Pending / undecided: render as before. One stable object so memoized markdown overrides do not rebuild. */
export const NO_CITATION_CHECK: CitationCheck = { invalid: new Set(), cited: [] };

export async function runCitationCheck(text: string, pack: StudyPack): Promise<CitationCheck> {
  const checked = await checkAnswerRefs(text, pack);
  const invalid = new Set(checked.filter(c => c.verdict === 'invalid').map(c => c.ref.text));
  return { invalid, cited: await loadCitedRefs(checked, pack) };
}

export function useCitationCheck(text: string, pack: StudyPack, complete: boolean): CitationCheck {
  const [result, setResult] = useState<{ text: string; pack: StudyPack; check: CitationCheck } | null>(null);
  useEffect(() => {
    if (!complete) return;
    let live = true;
    runCitationCheck(text, pack)
      .then(check => { if (live) setResult({ text, pack, check }); })
      .catch(() => {
        // Silent by design: checking is an enhancement over the plain answer.
        // The chapter loads it uses never reject (fetchBundledChapter → null),
        // and a ref that fails to load still shows its popover's error line.
      });
    return () => { live = false; };
  }, [text, pack, complete]);
  return complete && result?.text === text && result.pack === pack ? result.check : NO_CITATION_CHECK;
}
