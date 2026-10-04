import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import path from 'path';
import React from 'react';
import { parseStudyPack, StudyPack } from '../packTypes';
import AskAnswer, { answerFontSize } from '../AskAnswer';
import { preloadMarkdown } from '../../LazyMarkdown';
import { TYPE_SCALE } from '../principles';

// Warm react-markdown outside every timed budget; see preloadMarkdown() for why.
await preloadMarkdown();

const PACK_PATH = path.resolve(__dirname, '../../../public/packs/2026-10-02-matt6.json');
const pack: StudyPack = parseStudyPack(JSON.parse(readFileSync(PACK_PATH, 'utf-8')));

describe('answerFontSize', () => {
  it('scales by content length through the TYPE_SCALE tiers', () => {
    expect(answerFontSize('x'.repeat(120))).toBe(TYPE_SCALE.answerShort);   // boundary of short
    expect(answerFontSize('x'.repeat(121))).toBe(TYPE_SCALE.answerMedium);
    expect(answerFontSize('x'.repeat(240))).toBe(TYPE_SCALE.answerMedium);  // boundary of medium
    expect(answerFontSize('x'.repeat(241))).toBe(TYPE_SCALE.answerLong);
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

  it('makes every recognizable ref interactive — in-pack and bundled-data ones', async () => {
    render(
      <AskAnswer
        text={'Grounded in v.26 and 太6:33, cf. v.24 and Matthew 5:3.'}
        pack={pack}
      />
    );
    await screen.findByText(/Grounded in/);
    // ADR-0003 §8: in-pack refs (v.26, 太6:33) AND out-of-pack refs
    // (v.24 → bundled MAT 6, Matthew 5:3 → bundled MAT 5) are all tooltips.
    const interactive = screen.getAllByTestId('verse-ref');
    expect(interactive.map(el => el.textContent)).toEqual(['v.26', '太6:33', 'v.24', 'Matthew 5:3']);
  });

  it('shows the bilingual verse text on hover and hides it on leave', async () => {
    render(<AskAnswer text={'See v.26.'} pack={pack} />);
    const ref = await screen.findByTestId('verse-ref');
    fireEvent.mouseEnter(ref);
    const tooltip = screen.getByRole('tooltip');
    // Header: 简体 book first, then English (ADR-0003 §1), from the pack's book/chapter
    expect(screen.getByTestId('verse-tooltip-title')).toHaveTextContent('马太福音 6:26 · Matthew 6:26');
    expect(tooltip).toHaveTextContent('飞鸟');                 // CUV v.26
    expect(tooltip).toHaveTextContent('birds of the air');     // BSB v.26
    fireEvent.mouseLeave(ref);
    // Closing is delayed ~150ms so the pointer can travel into the popup.
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
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
