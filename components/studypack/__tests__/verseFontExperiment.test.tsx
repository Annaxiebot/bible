/**
 * verseFontExperiment.test.tsx — TEMPORARY 和合本 verse-font experiment · 经文字体试验测试
 *
 * The URL flag in both forms (query in the hash, query before the hash), the
 * on-demand WenKai regular stylesheet (same package + version as index.html's
 * bold link), and the user flow in TV mode: the flag puts the WenKai class on
 * the 和合本 verses only, "F" flips it live, and the corner label shows for 2 s.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import React from 'react';
import { SAMPLE_PACK_ID, TEST_PACK_PATH } from './fixtures';
import TVPresentationView from '../TVPresentationView';
import {
  readVerseFont, ensureWenKaiRegular, verseFontLabel, VERSE_FONT_WENKAI_CLASS, VERSE_FONT_LABEL_MS, WENKAI_REGULAR_CSS,
} from '../verseFontExperiment';

vi.mock('../askAIFallback', () => ({ streamStudyAI: vi.fn() }));

const INDEX_HTML = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');
const packJson = () => JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));

describe('readVerseFont', () => {
  it('reads ?verseFont=wenkai inside the hash and before it', () => {
    expect(readVerseFont({ search: '', hash: '#/pack/local-2026-10-02-pro1?verseFont=wenkai' })).toBe('wenkai');
    expect(readVerseFont({ search: '?verseFont=wenkai', hash: '#/pack/local-2026-10-02-pro1' })).toBe('wenkai');
  });

  it('defaults to sans for no flag or any other value', () => {
    expect(readVerseFont({ search: '', hash: '#/pack/x' })).toBe('sans');
    expect(readVerseFont({ search: '?verseFont=songti', hash: '#/pack/x?verseFont=bold' })).toBe('sans');
  });
});

describe('WenKai regular stylesheet', () => {
  it('is the same package and version as the bold heading CSS in index.html, regular weight', () => {
    const bold = /href="(https:\/\/cdn\.jsdelivr\.net\/npm\/lxgw-wenkai-webfont@[^/]+\/)lxgwwenkai-bold\.css"/.exec(INDEX_HTML);
    expect(bold).not.toBeNull();
    expect(WENKAI_REGULAR_CSS).toBe(`${bold![1]}lxgwwenkai-regular.css`);
  });

  it('is added to <head> once, however often it is asked for', () => {
    ensureWenKaiRegular();
    ensureWenKaiRegular();
    expect(document.head.querySelectorAll(`link[href="${WENKAI_REGULAR_CSS}"]`)).toHaveLength(1);
  });

  it('labels name the face Chinese first', () => {
    expect(verseFontLabel('wenkai')).toBe('经文字体 Verse font: 文楷 WenKai');
    expect(verseFontLabel('sans')).toBe('经文字体 Verse font: 黑体 Sans');
  });
});

/** The first scripture slide's verse rows: [和合本 <p>, BSB <p>] each. */
function verseColumns() {
  return [...document.querySelectorAll('[data-verse]')].map(row => [...row.querySelectorAll(':scope > p')]);
}

async function openScriptureSlide() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(packJson()) }));
  render(<TVPresentationView packId={SAMPLE_PACK_ID} onExit={vi.fn()} />);
  await waitFor(() => expect(screen.getByText('不要忧虑 Do Not Be Anxious')).toBeInTheDocument());
  await act(async () => {});
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  await waitFor(() => expect(verseColumns().length).toBeGreaterThan(0));
}

describe('TV mode verse font (user flow)', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('?verseFont=wenkai puts the WenKai class on every 和合本 verse and on no BSB verse', async () => {
    window.history.replaceState(null, '', `/#/pack/${SAMPLE_PACK_ID}?verseFont=wenkai`);
    await openScriptureSlide();
    for (const [cuv, bsb] of verseColumns()) {
      expect(cuv.className).toContain(VERSE_FONT_WENKAI_CLASS);
      expect(bsb.className).not.toContain(VERSE_FONT_WENKAI_CLASS);
    }
    expect(document.head.querySelector(`link[href="${WENKAI_REGULAR_CSS}"]`)).not.toBeNull();
    expect(screen.queryByTestId('verse-font-label')).toBeNull(); // the label is for a live flip only
  });

  it('without the flag the verses are sans; F flips to WenKai and back, with a 2-second label', async () => {
    window.history.replaceState(null, '', `/#/pack/${SAMPLE_PACK_ID}`);
    await openScriptureSlide();
    expect(verseColumns()[0][0].className).not.toContain(VERSE_FONT_WENKAI_CLASS);

    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: 'f' });
    expect(verseColumns()[0][0].className).toContain(VERSE_FONT_WENKAI_CLASS);
    expect(screen.getByTestId('verse-font-label')).toHaveTextContent(verseFontLabel('wenkai'));
    act(() => { vi.advanceTimersByTime(VERSE_FONT_LABEL_MS); });
    expect(screen.queryByTestId('verse-font-label')).toBeNull();

    fireEvent.keyDown(window, { key: 'F' });
    expect(verseColumns()[0][0].className).not.toContain(VERSE_FONT_WENKAI_CLASS);
    expect(screen.getByTestId('verse-font-label')).toHaveTextContent(verseFontLabel('sans'));
  });

  it('adding the flag to the hash of an open TV view (no reload) switches the verses', async () => {
    window.history.replaceState(null, '', `/#/pack/${SAMPLE_PACK_ID}`);
    await openScriptureSlide();
    window.history.replaceState(null, '', `/#/pack/${SAMPLE_PACK_ID}?verseFont=wenkai`);
    act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(verseColumns()[0][0].className).toContain(VERSE_FONT_WENKAI_CLASS);
  });

  it('Cmd/Ctrl+F is left to the browser', async () => {
    window.history.replaceState(null, '', `/#/pack/${SAMPLE_PACK_ID}`);
    await openScriptureSlide();
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(verseColumns()[0][0].className).not.toContain(VERSE_FONT_WENKAI_CLASS);
    expect(screen.queryByTestId('verse-font-label')).toBeNull();
  });
});
