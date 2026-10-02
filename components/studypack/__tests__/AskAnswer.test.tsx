import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import path from 'path';
import React from 'react';
import { parseStudyPack, StudyPack } from '../packTypes';
import AskAnswer, { answerFontSize } from '../AskAnswer';

const PACK_PATH = path.resolve(__dirname, '../../../public/packs/2026-10-02-matt6.json');
const pack: StudyPack = parseStudyPack(JSON.parse(readFileSync(PACK_PATH, 'utf-8')));

describe('answerFontSize', () => {
  it('scales by content length: short 5vh, medium 4vh, long 3vh', () => {
    expect(answerFontSize('x'.repeat(120))).toBe('5vh');  // boundary of short
    expect(answerFontSize('x'.repeat(121))).toBe('4vh');
    expect(answerFontSize('x'.repeat(240))).toBe('4vh');  // boundary of medium
    expect(answerFontSize('x'.repeat(241))).toBe('3vh');
  });
});

describe('AskAnswer rendering', () => {
  it('renders markdown (bold, list items) without raw HTML injection', async () => {
    render(
      <AskAnswer
        text={'**Trust** him:\n\n- first point\n- second <script>alert(1)</script> point'}
        pack={pack}
      />
    );
    const bold = await screen.findByText('Trust');
    expect(bold.tagName).toBe('STRONG');
    expect(screen.getByText(/first point/)).toBeInTheDocument();
    // react-markdown escapes raw HTML — no script element is created
    expect(document.querySelector('script')).toBeNull();
  });

  it('turns in-pack refs into tooltips and leaves out-of-pack refs plain', async () => {
    render(
      <AskAnswer
        text={'Grounded in v.26 and 太6:33, cf. v.24 and Matthew 5:3.'}
        pack={pack}
      />
    );
    await screen.findByText(/Grounded in/);
    const interactive = screen.getAllByTestId('verse-ref');
    expect(interactive.map(el => el.textContent)).toEqual(['v.26', '太6:33']);
    // Out-of-pack refs are styled text, not interactive
    expect(screen.getByText('v.24')).toBeInTheDocument();
    expect(screen.getByText('Matthew 5:3')).toBeInTheDocument();
  });

  it('shows the bilingual verse text on hover and hides it on leave', async () => {
    render(<AskAnswer text={'See v.26.'} pack={pack} />);
    const ref = await screen.findByTestId('verse-ref');
    fireEvent.mouseEnter(ref);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('飞鸟');                 // CUV v.26
    expect(tooltip).toHaveTextContent('birds of the sky');     // WEB v.26
    fireEvent.mouseLeave(ref);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('toggles the tooltip on click for touch screens', async () => {
    render(<AskAnswer text={'See vv.33–34.'} pack={pack} />);
    const ref = await screen.findByTestId('verse-ref');
    fireEvent.click(ref);
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('先求他的国'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('不要为明天忧虑'); // both verses
    fireEvent.click(ref);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
