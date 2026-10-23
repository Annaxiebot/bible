/**
 * LandingReviewFixes — the 2026-10 review's landing items: a concrete
 * bilingual hero, the published-Scripture vs AI-draft distinction, sign-in
 * disclosed before the click (creation / Ask AI), the no-sign-in sample,
 * "Read the bilingual Bible", language tags on English halves, a skip link.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LandingHero from '../LandingHero';
import LandingPersonal from '../LandingPersonal';
import Landing from '../Landing';
import { SAMPLE_PACK_HASH, NEW_STUDY_HASH, APP_HASH } from '../landingRoute';
import {
  HERO_SUB_ZH, HERO_SUB_EN, HERO_SOURCE_NOTE, GROUP_CTA, NEW_STUDY_LINE, SAMPLE_NO_SIGNIN,
  NEW_STUDY_SIGNIN_NOTE, PERSONAL_CTA, NEXT_HEADING_EN, NEXT_EYEBROW, AI_SIGNIN_NOTE,
} from '../landingStrings';
import { MAIN_CONTENT_ID, SKIP_LINK_LABEL } from '../../shared/SkipLink';

describe('landing copy (2026-10 review)', () => {
  it('hero says concretely what the site does, in both languages', () => {
    expect(HERO_SUB_EN).toBe(
      'Turn a Bible passage into a bilingual group study. Draft discussion questions, present them on your TV, and keep your group connected with mid-week check-ins.');
    expect(HERO_SUB_ZH).toMatch(/双语小组查经/);
    render(<LandingHero />);
    expect(screen.getByTestId('hero-sub')).toHaveTextContent(HERO_SUB_EN);
    expect(screen.getByText(HERO_SUB_EN)).toHaveAttribute('lang', 'en');
  });

  it('hero separates published Scripture from AI drafts the leader reviews', () => {
    render(<LandingHero />);
    const sourceNote = screen.getByTestId('hero-source-note');
    expect(sourceNote).toHaveTextContent(HERO_SOURCE_NOTE.zh);
    expect(sourceNote).toHaveTextContent(HERO_SOURCE_NOTE.en);
    expect(HERO_SOURCE_NOTE.en).toMatch(/published Bible translations/);
    expect(HERO_SOURCE_NOTE.en).toMatch(/AI drafts that the leader reviews/);
  });

  it('the sample CTA says no sign-in; New study discloses Google sign-in before the click', () => {
    render(<LandingHero />);
    const sample = screen.getByRole('link', { name: GROUP_CTA });
    expect(sample).toHaveAttribute('href', SAMPLE_PACK_HASH);
    expect(sample).toHaveAccessibleDescription(SAMPLE_NO_SIGNIN);
    const create = screen.getByRole('link', { name: NEW_STUDY_LINE });
    expect(create).toHaveAttribute('href', NEW_STUDY_HASH);
    expect(create).toHaveAccessibleDescription(NEW_STUDY_SIGNIN_NOTE);
    expect(NEW_STUDY_SIGNIN_NOTE).toMatch(/Google sign-in/);
    expect(GROUP_CTA).toBe('看完整示范 Explore a complete sample');
  });

  it('personal CTA reads "Read the bilingual Bible" (was the generic "Open the app")', () => {
    render(<LandingPersonal />);
    expect(screen.getByRole('link', { name: PERSONAL_CTA })).toHaveAttribute('href', APP_HASH);
    expect(PERSONAL_CTA).toBe('阅读双语圣经 Read the bilingual Bible');
  });

  it('the sample block is labelled as a sample, not a dated "next study"', () => {
    expect(NEXT_HEADING_EN).toBe('Explore a complete sample');
    expect(NEXT_EYEBROW).not.toMatch(/Next study|下次/);
  });

  it('copy never says 签到 for sign-up', async () => {
    const strings = await import('../landingStrings');
    const ns = await import('../../newstudy/newStudyStrings');
    const all = JSON.stringify(strings) + JSON.stringify(ns);
    expect(all).not.toContain('签到');
  });
});

describe('Landing page — keyboard and language', () => {
  it('has a skip link that focuses the main landmark without changing the route hash', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    window.location.hash = '';
    render(<Landing />);
    const skip = screen.getByRole('link', { name: SKIP_LINK_LABEL });
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', MAIN_CONTENT_ID);
    expect(main).toHaveAttribute('tabindex', '-1');
    fireEvent.click(skip);
    expect(document.activeElement).toBe(main);
    expect(window.location.hash).toBe('');
    // The AI sign-in requirement is stated on the page too.
    expect(screen.getByTestId('landing-ai-signin-note')).toHaveTextContent(AI_SIGNIN_NOTE);
    // English halves are tagged; the page itself is Chinese-first.
    expect(screen.getByTestId('landing-page')).toHaveAttribute('lang', 'zh-Hans');
    const english = Array.from(document.querySelectorAll('.ld-en, .stl-pill-en, .ld-h2-en, .ld-nav-en'));
    expect(english.length).toBeGreaterThan(5);
    expect(english.every(el => el.getAttribute('lang') === 'en')).toBe(true);
    vi.unstubAllGlobals();
  });
});
