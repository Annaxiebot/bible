/**
 * slideTypography.ts — type sizes of a TV slide · 幻灯片字号
 *
 * On a TV (any landscape screen) every size is the TYPE_SCALE senior floor
 * from principles.ts or a step above it. On a portrait phone the vh sizes
 * outgrow the width (a 7vh heading wrapped to four lines at 390×844), so the
 * same roles switch to width-based sizes that keep the px floors.
 * Content roles are then multiplied by the slide's fit factor (fitted()),
 * which only ever grows them; headings are never fitted.
 */
import type { CSSProperties } from 'react';
import { useSyncExternalStore } from 'react';
import { TYPE_SCALE } from './principles';
import { FIT_VAR } from './fitScale';

/** Longest line a fitted text block may run, in its own ems (~36 汉字 / ~70 Latin letters), so a wide screen never gets one giant line. */
export const MAX_LINE_EM = 36;

/** Portrait phones: narrower than the md breakpoint and taller than wide. */
export const PORTRAIT_PHONE_QUERY = '(orientation: portrait) and (max-width: 767px)';

export interface SlideTypography {
  heading: CSSProperties;
  headingTail: CSSProperties;  // passage reference + part counter after the heading name
  title: CSSProperties;
  body: CSSProperties;
  question: CSSProperties;
  verse: CSSProperties;
  verseNumber: CSSProperties;
  keyPhrase: CSSProperties;
  columnLabel: CSSProperties;
  lifeMenu: CSSProperties;
}

interface Sizes {
  heading: string; headingTail: string; title: string; body: string; question: string;
  verse: string; keyPhrase: string; columnLabel: string; lifeMenu: string;
}

/** TV: TYPE_SCALE floors; scripture a step above its floor (3.8vh — slideFit.ts budgets rows for it). */
const TV_SIZES: Sizes = {
  heading: TYPE_SCALE.heading,
  headingTail: 'max(16px, 4.2vh)',
  title: 'max(22px, 9vh)',
  body: TYPE_SCALE.body,
  question: TYPE_SCALE.question,
  verse: 'max(16px, 3.8vh)',
  keyPhrase: 'max(18px, 5.4vh)',
  columnLabel: TYPE_SCALE.verse,
  lifeMenu: TYPE_SCALE.lifeMenuRow,
};

/** Portrait phone: width-based, never below the TYPE_SCALE px floors. */
const PORTRAIT_SIZES: Sizes = {
  heading: 'max(20px, 8vw)',
  headingTail: 'max(16px, 5vw)',
  title: 'max(22px, 10vw)',
  body: 'max(16px, 5.5vw)',
  question: 'max(18px, 6.5vw)',
  verse: 'max(16px, 5vw)',
  keyPhrase: 'max(18px, 6vw)',
  columnLabel: 'max(16px, 5vw)',
  lifeMenu: 'max(16px, 5vw)',
};

/** The slide's text styles for a TV (false) or a portrait phone (true). */
export function slideTypography(portraitPhone: boolean): SlideTypography {
  const s = portraitPhone ? PORTRAIT_SIZES : TV_SIZES;
  return {
    heading: { fontSize: s.heading, lineHeight: 1.15, textWrap: 'balance' },
    headingTail: { fontSize: s.headingTail },
    title: { fontSize: s.title, lineHeight: 1.2, textWrap: 'balance' },
    body: { fontSize: s.body, lineHeight: 1.5 },
    question: { fontSize: s.question, lineHeight: 1.4 },
    verse: { fontSize: s.verse, lineHeight: 1.5 },
    verseNumber: { fontSize: '0.55em', lineHeight: 0, verticalAlign: '0.6em' },
    keyPhrase: { fontSize: s.keyPhrase, lineHeight: 1.3, textWrap: 'balance' },
    columnLabel: { fontSize: s.columnLabel, lineHeight: 1.4 },
    lifeMenu: { fontSize: s.lifeMenu, lineHeight: 1.45 },
  };
}

/**
 * A content role scaled by the slide's fit factor (fitScale.ts, useFitScale):
 * base size × var(--fit), 1 outside a fit area, so the floors above still bind.
 */
export function fitted(style: CSSProperties, capLine = true): CSSProperties {
  const fontSize = `calc(${String(style.fontSize)} * var(${FIT_VAR}, 1))`;
  return capLine ? { ...style, fontSize, maxWidth: `${MAX_LINE_EM}em` } : { ...style, fontSize };
}

const TV = slideTypography(false);
const PORTRAIT = slideTypography(true);

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(PORTRAIT_PHONE_QUERY);
  query?.addEventListener?.('change', onChange);
  return () => query?.removeEventListener?.('change', onChange);
}

/** The styles for the current screen; follows rotation. */
export function useSlideTypography(): SlideTypography {
  const portrait = useSyncExternalStore(subscribe, () => window.matchMedia?.(PORTRAIT_PHONE_QUERY).matches ?? false);
  return portrait ? PORTRAIT : TV;
}
