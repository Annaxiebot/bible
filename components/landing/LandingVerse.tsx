/**
 * LandingVerse.tsx — a verse on the landing, from the bundled Bible data · 首页经文
 *
 * The landing quotes two verses (the personal side-by-side card, the key
 * verse beside the next study). Their text is never copied into the code:
 * useBundledVerse loads 和合本 + BSB through the same seam as the TV verse
 * popups (externalVerses.planExternalRef → public/bible-data, ADR-0003 §4),
 * and VerseRefLabel renders the reference as the interactive popup (§8).
 * A failed load leaves the text empty; the reference still shows.
 */
import React, { useEffect, useState } from 'react';
import { findVerseRefs } from '../studypack/verseRefs';
import { planExternalRef } from '../studypack/externalVerses';
import { bilingualRefLabel } from '../studypack/refLabel';
import VerseTooltip from '../studypack/VerseTooltip';
import type { PackVerse } from '../studypack/packTypes';

/** Load one "Book C:V" reference's 和合本 + BSB text; null until loaded (or if it cannot be). */
export function useBundledVerse(ref: string): PackVerse | null {
  const [verse, setVerse] = useState<PackVerse | null>(null);
  useEffect(() => {
    let cancelled = false;
    const found = findVerseRefs(ref)[0];
    const plan = found ? planExternalRef(found) : null;
    plan?.load?.()
      .then(verses => { if (!cancelled) setVerse(verses[0] ?? null); })
      .catch(() => {
        // Handled: the quote stays empty and the reference line still renders —
        // decoration must never break the landing (offline, missing chapter).
        if (!cancelled) setVerse(null);
      });
    return () => { cancelled = true; };
  }, [ref]);
  return verse;
}

/** A reference as the verse popup (falls back to plain text if it cannot be parsed). */
export const VerseRefLabel: React.FC<{ text: string }> = ({ text }) => {
  const ref = findVerseRefs(text)[0];
  const plan = ref ? planExternalRef(ref) : null;
  if (!plan) return <>{text}</>;
  return <VerseTooltip label={text} title={bilingualRefLabel(ref)} load={plan.load} />;
};

/** "马太福音 6:34 · Matthew 6:34", both halves interactive. */
export const BilingualRef: React.FC<{ refs: { zh: string; en: string }; suffix?: string }> = ({ refs, suffix }) => (
  <>
    <VerseRefLabel text={refs.zh} />{' · '}<VerseRefLabel text={refs.en} />{suffix}
  </>
);
