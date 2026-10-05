/**
 * TVSlideFonts.test.tsx — TV headings in 霞鹜文楷 WenKai · 大屏标题字体测试
 *
 * Slide headings, the title slide and the key phrase carry .stl-tv-head
 * (Chinese in WenKai bold, the English half in the TV's Latin face); the
 * heading's quiet tail and the body / verse text do not.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TVSlide from '../TVSlide';
import type { Slide } from '../packTypes';
import { FIT_VAR } from '../fitScale';

const TV_HEAD = 'stl-tv-head';

describe('TVSlide heading fonts', () => {
  it('a section heading carries the WenKai class; its passage tail and body lines stay in the body face', () => {
    render(<TVSlide slide={{ kind: 'context', heading: '背景 Context — 马太福音 6:25 Matthew', body: ['一行 · a line'] }} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.className).toContain(TV_HEAD);
    expect(heading.querySelector('.stl-tv-tail')).not.toBeNull();
    expect(screen.getByText('一行 · a line').className).not.toContain(TV_HEAD);
  });

  it('the title slide heading carries the WenKai class', () => {
    render(<TVSlide slide={{ kind: 'title', heading: '不要忧虑 Do Not Be Anxious', body: ['马太福音 6:25–34'] }} />);
    expect(screen.getByRole('heading', { level: 1 }).className).toContain(TV_HEAD);
  });

  it('the key phrase carries the WenKai class; verses do not unless the experiment asks', () => {
    const slide: Slide = {
      kind: 'scripture', heading: '经文 Scripture', keyPhrase: '「不要为生命忧虑」',
      verses: [{ num: 25, cuv: '所以我告诉你们', en: 'Therefore I tell you' }],
    };
    render(<TVSlide slide={slide} />);
    expect(screen.getByTestId('key-phrase').className).toContain(TV_HEAD);
    for (const p of document.querySelectorAll('[data-verse] > p')) expect(p.className).toBe('text-stl-text');
  });
});

describe('TVSlide fit area', () => {
  it('fits the content under the heading, never the heading itself', () => {
    render(<TVSlide slide={{ kind: 'discussion', heading: '讨论 Discussion', question: '问题？ · A question?', questionNumber: 1, questionTotal: 5 }} />);
    const area = screen.getByTestId('tv-fit-area');
    expect(area).toContainElement(screen.getByText('问题？ · A question?'));
    expect(area).not.toContainElement(screen.getByRole('heading', { level: 1 }));
    expect(screen.getByText('问题？ · A question?').style.fontSize).toContain(`var(${FIT_VAR}, 1)`);
  });

  it('the title slide fits its whole title block', () => {
    render(<TVSlide slide={{ kind: 'title', heading: '不要忧虑 Do Not Be Anxious', body: ['马太福音 6:25–34'] }} />);
    const area = screen.getByTestId('tv-fit-area');
    expect(area).toContainElement(screen.getByRole('heading', { level: 1 }));
    expect(area).toContainElement(screen.getByText('马太福音 6:25–34'));
  });
});
