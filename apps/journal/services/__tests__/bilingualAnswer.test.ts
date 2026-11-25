/**
 * bilingualAnswer.test.ts — the two-pane answer protocol (ADR-0017)
 */
import { describe, it, expect } from 'vitest';
import { splitBilingualAnswer, toHeadingForm, ZH_SECTION_HEADING, EN_SECTION_HEADING } from '../bilingualAnswer';

const ANSWER = `${ZH_SECTION_HEADING}\n恩典是白白得来的礼物 (grace)。\n\n${EN_SECTION_HEADING}\nGrace is a free gift.`;

describe('splitBilingualAnswer — the heading form', () => {
  it('splits a canonical answer into both panes, headings removed', () => {
    expect(splitBilingualAnswer(ANSWER)).toEqual({ zh: '恩典是白白得来的礼物 (grace)。', en: 'Grace is a free gift.' });
  });

  it.each([
    ['# English', '#'], ['### english', 'case + level'], ['**English**', 'bold'], ['## **English:**', 'bold + colon'],
    ['English：', 'full-width colon'], ['## English Section', 'section'], ['## 英文', 'Chinese name'],
    ['  ##   English  ', 'whitespace'],
  ])('tolerates the English heading variant %s (%s)', heading => {
    expect(splitBilingualAnswer(`**中文**\n中文段落\n${heading}\nEnglish part`)).toEqual({ zh: '中文段落', en: 'English part' });
  });

  it('text before any heading belongs to the Chinese pane', () => {
    expect(splitBilingualAnswer('前言\n## 中文\n正文\n## English\nBody')).toEqual({ zh: '前言\n正文', en: 'Body' });
  });

  it('either order: English first still lands each half in its own pane', () => {
    expect(splitBilingualAnswer('## English\nBody\n## 中文\n正文')).toEqual({ zh: '正文', en: 'Body' });
  });

  it('a sentence that mentions English, or a bare "English" line, is not a heading', () => {
    expect(splitBilingualAnswer('这节经文的 English translation 是 BSB。').en).toBeNull();
    expect(splitBilingualAnswer('中文\nEnglish\n说明').en).toBeNull();
  });

  it('keeps sub-headings inside a section', () => {
    expect(splitBilingualAnswer(`${ANSWER}\n### Notes\nMore.`).en).toBe('Grace is a free gift.\n### Notes\nMore.');
  });
});

describe('splitBilingualAnswer — fallback (no English section)', () => {
  it('no marker at all: everything in the Chinese pane, en null', () => {
    expect(splitBilingualAnswer('只有中文的回答。\n第二行。')).toEqual({ zh: '只有中文的回答。\n第二行。', en: null });
  });

  it('only the 中文 heading: the heading is dropped, en null', () => {
    expect(splitBilingualAnswer('## 中文\n只有中文。')).toEqual({ zh: '只有中文。', en: null });
  });

  it('an English heading with nothing under it: en null once finished, "" while streaming', () => {
    expect(splitBilingualAnswer('## 中文\n中文\n## English\n')).toEqual({ zh: '中文', en: null });
    expect(splitBilingualAnswer('## 中文\n中文\n## English\n', { partial: true })).toEqual({ zh: '中文', en: '' });
  });

  it('empty text', () => {
    expect(splitBilingualAnswer('')).toEqual({ zh: '', en: null });
  });
});

describe('splitBilingualAnswer — legacy [SPLIT] content (old threads and research)', () => {
  it('splits on [SPLIT] on its own line', () => {
    expect(splitBilingualAnswer('中文回答\n[SPLIT]\nEnglish answer')).toEqual({ zh: '中文回答', en: 'English answer' });
  });

  it('splits on an inline, lower-case or full-width marker', () => {
    expect(splitBilingualAnswer('中文[SPLIT]English')).toEqual({ zh: '中文', en: 'English' });
    expect(splitBilingualAnswer('中文\n[split]\nEnglish')).toEqual({ zh: '中文', en: 'English' });
    expect(splitBilingualAnswer('中文\n［SPLIT］\nEnglish')).toEqual({ zh: '中文', en: 'English' });
  });

  it('a second marker never shows as text', () => {
    expect(splitBilingualAnswer('中文\n[SPLIT]\nEnglish\n[SPLIT]\nmore')).toEqual({ zh: '中文', en: 'English\n\nmore' });
  });

  it('a stray [SPLIT] in a heading-form answer is removed', () => {
    expect(splitBilingualAnswer(`${ZH_SECTION_HEADING}\n中文\n[SPLIT]\n${EN_SECTION_HEADING}\nEnglish`)).toEqual({ zh: '中文', en: 'English' });
  });
});

describe('splitBilingualAnswer — streaming (partial)', () => {
  /** Feed `text` in chunks of `size` and collect every pane state the UI would render. */
  function stream(text: string, size: number) {
    const states: Array<{ zh: string; en: string | null }> = [];
    for (let end = size; end < text.length + size; end += size) {
      states.push(splitBilingualAnswer(text.slice(0, Math.min(end, text.length)), { partial: true }));
    }
    return states;
  }

  it.each([1, 2, 3, 5, 7])('chunks of %i characters: no marker text ever reaches either pane, and the end state is complete', size => {
    const states = stream(ANSWER, size);
    for (const s of states) {
      expect(s.zh).not.toMatch(/#|Eng|中文\n/);
      expect(s.en ?? '').not.toContain('#');
    }
    expect(states[states.length - 1]).toEqual({ zh: '恩典是白白得来的礼物 (grace)。', en: 'Grace is a free gift.' });
  });

  it('the Chinese pane fills live before the English heading arrives', () => {
    expect(splitBilingualAnswer('## 中文\n恩典是', { partial: true })).toEqual({ zh: '恩典是', en: null });
  });

  it('a half-written legacy marker is held back too', () => {
    expect(splitBilingualAnswer('中文回答\n[SPL', { partial: true })).toEqual({ zh: '中文回答', en: null });
  });

  it('a finished answer is never trimmed of a short last line', () => {
    expect(splitBilingualAnswer('回答\nE')).toEqual({ zh: '回答\nE', en: null });
  });
});

describe('toHeadingForm — history sent back to the model', () => {
  it('rewrites a legacy [SPLIT] answer into the heading form', () => {
    expect(toHeadingForm('中文\n[SPLIT]\nEnglish')).toBe(`${ZH_SECTION_HEADING}\n中文\n\n${EN_SECTION_HEADING}\nEnglish`);
  });

  it('leaves current answers unchanged', () => {
    expect(toHeadingForm(ANSWER)).toBe(ANSWER);
    expect(toHeadingForm('plain')).toBe('plain');
  });
});
