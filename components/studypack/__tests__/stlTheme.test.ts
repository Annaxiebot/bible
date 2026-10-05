/**
 * stlTheme.test.ts — the dark theme's colour tokens · 主题色测试
 *
 * styles/stlTheme.css is the ONE source of colour for the landing page and
 * TV mode (R3). This test pins the token values, proves WCAG AA contrast for
 * the pairings the views actually use, and guards against drift two ways:
 * every token must be mapped to a Tailwind `stl.*` colour in index.html, and
 * the themed views must not re-introduce the raw slate/amber/white classes
 * the softening pass removed (owner feedback: black + yellow/white was too
 * contrasty).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const TOKEN_CSS = readFileSync(resolve(ROOT, 'styles/stlTheme.css'), 'utf8');
const INDEX_HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

/** Hex or rgba() value per `--stl-*` token, parsed from the CSS file. */
function parseTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const m of css.matchAll(/--(stl-[a-z0-9-]+):\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  return tokens;
}
const TOKENS = parseTokens(TOKEN_CSS);

const EXPECTED_TOKENS: Record<string, string> = {
  'stl-bg': '#151a23',
  'stl-surface': '#1c2230',
  'stl-surface-2': '#262d3b',
  'stl-text': '#e4e7ec',
  'stl-text-2': '#aeb4bf',
  'stl-text-3': '#8a919c',
  'stl-gold': '#d9bf7a',
  'stl-gold-hover': '#e8d39a',
  'stl-gold-dim': 'rgba(217, 191, 122, 0.16)',
  'stl-gold-glow': 'rgba(217, 191, 122, 0.4)',
  'stl-border': 'rgba(228, 231, 236, 0.12)',
  'stl-glass': 'rgba(21, 26, 35, 0.88)',
  // landing paper theme (2026-10 redesign)
  'stl-paper': '#faf8f2',
  'stl-paper-2': '#f3efe4',
  'stl-card': '#ffffff',
  'stl-ink': '#1d2430',
  'stl-ink-2': '#4a5260',
  'stl-line': '#e2dccb',
  'stl-gold-mid': '#a67c2e',
  'stl-gold-deep': '#7a5518',
  'stl-cta': '#d4ad5c',
  'stl-cta-hover': '#c99f48',
  'stl-night-line': '#2c3442',
  'stl-on-night': '#f3efe4',
  'stl-on-night-2': '#b8bfcc',
  'stl-gold-pale': '#e6cd8c',
  'stl-gold-warm': '#c9a24f',
};

// WCAG 2.1 §1.4.3: 4.5:1 for normal text, 3:1 for large text (≥24px / ≥19px bold).
const AA_NORMAL = 4.5;
const AA_LARGE = 3;

/** sRGB channel → linear light (WCAG relative-luminance formula). */
function linearChannel(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}
export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

describe('stlTheme tokens (R3: one source)', () => {
  it('pins every token value', () => {
    expect(TOKENS).toEqual(EXPECTED_TOKENS);
  });

  it('backgrounds are warm charcoal, never pure black; text is off-white, never pure white', () => {
    for (const key of ['stl-bg', 'stl-surface', 'stl-surface-2']) {
      expect(relativeLuminance(TOKENS[key])).toBeGreaterThan(relativeLuminance('#000000'));
    }
    expect(TOKENS['stl-text']).not.toBe('#ffffff');
    expect(relativeLuminance(TOKENS['stl-text'])).toBeLessThan(relativeLuminance('#ffffff'));
  });

  it('maps every token to a Tailwind stl.* colour in index.html', () => {
    for (const key of Object.keys(TOKENS)) {
      expect(INDEX_HTML, `index.html tailwind.config lacks var(--${key})`).toContain(`var(--${key})`);
    }
  });
});

describe('stlTheme contrast (WCAG AA)', () => {
  const { 'stl-bg': bg, 'stl-surface': surface } = TOKENS;
  const bodyPairs: Array<[string, string]> = [
    ['stl-text', 'stl-bg'], ['stl-text', 'stl-surface'],
    ['stl-text-2', 'stl-bg'], ['stl-text-2', 'stl-surface'],
    ['stl-gold', 'stl-bg'], ['stl-gold', 'stl-surface'],
    ['stl-gold-hover', 'stl-bg'],
    ['stl-bg', 'stl-gold'],         // CTA label on a gold button
    ['stl-bg', 'stl-gold-hover'],   // CTA label on hover
  ];
  it.each(bodyPairs)('%s on %s ≥ 4.5:1 (body text)', (fg, on) => {
    expect(contrastRatio(TOKENS[fg], TOKENS[on])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  // Muted chrome (slide counter, hints, notes) is large on a TV; AA-large applies.
  it('stl-text-3 on bg and surface ≥ 3:1 (large chrome)', () => {
    expect(contrastRatio(TOKENS['stl-text-3'], bg)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrastRatio(TOKENS['stl-text-3'], surface)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('the token set is softer than the old slate-950 + amber-300 pairing', () => {
    const oldRatio = contrastRatio('#fcd34d', '#020617');
    expect(contrastRatio(TOKENS['stl-gold'], bg)).toBeLessThan(oldRatio);
    expect(contrastRatio(TOKENS['stl-text'], bg)).toBeLessThan(contrastRatio('#ffffff', '#020617'));
  });
});

describe('landing paper theme contrast (WCAG AA)', () => {
  // Body and small text on the paper page, its cards and tinted band; text on the dark bands.
  const bodyPairs: Array<[string, string]> = [
    ['stl-ink', 'stl-paper'], ['stl-ink', 'stl-paper-2'], ['stl-ink', 'stl-card'],
    ['stl-ink-2', 'stl-paper'], ['stl-ink-2', 'stl-paper-2'], ['stl-ink-2', 'stl-card'],
    ['stl-gold-deep', 'stl-paper'], ['stl-gold-deep', 'stl-paper-2'], ['stl-gold-deep', 'stl-card'], // eyebrows, refs, AI line
    ['stl-ink', 'stl-cta'], ['stl-ink', 'stl-cta-hover'],             // gold pill labels
    ['stl-on-night', 'stl-bg'], ['stl-on-night-2', 'stl-bg'], ['stl-gold-pale', 'stl-bg'],
    ['stl-gold-warm', 'stl-bg'], ['stl-on-night-2', 'stl-ink'],
  ];
  it.each(bodyPairs)('%s on %s ≥ 4.5:1 (body text)', (fg, on) => {
    expect(contrastRatio(TOKENS[fg], TOKENS[on])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  // The headline gradient (88px), big figures (≥ 44px) and the 22px semibold passage ref
  // run gold-mid → gold-deep: large text, so its lighter end needs 3:1.
  it('stl-gold-mid on paper and card ≥ 3:1 (large text only), and it is NOT body-safe', () => {
    for (const on of ['stl-paper', 'stl-paper-2', 'stl-card']) {
      expect(contrastRatio(TOKENS['stl-gold-mid'], TOKENS[on])).toBeGreaterThanOrEqual(AA_LARGE);
    }
    expect(contrastRatio(TOKENS['stl-gold-mid'], TOKENS['stl-paper'])).toBeLessThan(AA_NORMAL);
  });
});

describe('themed views use tokens only', () => {
  const VIEW_FILES = [
    'components/landing/Landing.tsx', 'components/landing/LandingCards.tsx',
    'components/landing/LandingGate.tsx', 'components/landing/LandingHero.tsx',
    'components/landing/LandingNav.tsx', 'components/landing/LandingNextStudy.tsx',
    'components/landing/LandingNumbers.tsx', 'components/landing/LandingSection.tsx',
    'components/landing/LandingGroup.tsx', 'components/landing/LandingPersonal.tsx',
    'components/shared/Pill.tsx', 'components/landing/LandingVerse.tsx',
    'components/landing/LandingLeaderLink.tsx', 'components/landing/landing.css',
    'components/landing/landingSections.css',
    'components/studypack/TVPresentationView.tsx', 'components/studypack/TVSlide.tsx',
    'components/studypack/AskAIOverlay.tsx', 'components/studypack/AskAnswer.tsx',
    'components/studypack/VerseTooltip.tsx',
    // member pages on paper (2026-10-04) + their shared styles
    'components/shared/paperStyles.ts', 'styles/stlShared.css',
    'components/signup/SignupPage.tsx', 'components/signup/SignupForm.tsx', 'components/signup/PracticeStep.tsx',
    'components/signup/QrPage.tsx', 'components/signup/NoSignupNotice.tsx',
    'components/checkin/CheckinPage.tsx', 'components/checkin/StopPage.tsx',
  ];
  // `print:` variants are exempt: the #/qr page prints black on white by design.
  const LEGACY_CLASS = /(?<!print:)\b(bg|text|border|outline|fill|stroke)-(black|white|slate|amber|yellow)(-\d+)?(\/\d+)?\b/;
  const RAW_HEX = /#[0-9a-fA-F]{6}\b/;

  it.each(VIEW_FILES)('%s has no legacy slate/amber/white classes or raw hex colours', file => {
    const src = readFileSync(resolve(ROOT, file), 'utf8');
    expect(src.match(LEGACY_CLASS)?.[0]).toBeUndefined();
    expect(src.match(RAW_HEX)?.[0]).toBeUndefined();
  });
});

describe('shared font stacks (R3: one source)', () => {
  const SHARED_CSS = readFileSync(resolve(ROOT, 'styles/stlShared.css'), 'utf8');
  const LANDING_CSS = readFileSync(resolve(ROOT, 'components/landing/landing.css'), 'utf8');

  it('styles/stlShared.css names WenKai for the heading stacks; the TV stack keeps Inter first for the English half', () => {
    expect(SHARED_CSS).toMatch(/--stl-font-head:\s*'Fraunces', 'LXGW WenKai'/);
    expect(SHARED_CSS).toMatch(/--stl-font-tv-head:\s*'Inter', 'LXGW WenKai'/);
  });

  it('the landing aliases the shared stacks instead of repeating them', () => {
    expect(LANDING_CSS).not.toContain("'LXGW WenKai'");
    expect(LANDING_CSS).not.toContain("'Inter'");
    expect(LANDING_CSS).toContain('var(--stl-font-head)');
  });

  it('index.tsx loads the shared stylesheet app-wide (member pages and TV mode use it, not only the landing)', () => {
    expect(readFileSync(resolve(ROOT, 'index.tsx'), 'utf8')).toContain("import './styles/stlShared.css'");
  });
});
