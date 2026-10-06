/**
 * AskAnswerCitations.test.tsx — a checked answer on screen · 引用核对的呈现
 *
 * Against the real bundled chapters (bundledFetch.ts): a reference that
 * does not exist renders as text + NO_SUCH_VERSE_MARK with no popover; the
 * overlay's latest answer (fit) lists valid outside refs under
 * VERSES_CITED_HEADING (≤3 refs, ≤2 verses then "…", in-pack refs left
 * out, no block when none); text that only looks like a ref ("at 7:30",
 * "下午3:00") gets no marker and no link; nothing is checked while the
 * answer streams.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { parseStudyPack, StudyPack } from '../packTypes';
import AskAnswer from '../AskAnswer';
import { clearExternalVerseCache } from '../externalVerses';
import { NO_SUCH_VERSE_MARK, VERSES_CITED_HEADING } from '../tvHints';
import { MAX_CITED_REFS, MAX_CITED_VERSES } from '../citations';
import { preloadMarkdown } from '../../LazyMarkdown';
import { TEST_PACK_PATH } from './fixtures';
import { stubBundledFetch } from './bundledFetch';

// Warm react-markdown outside every timed budget; see preloadMarkdown() for why.
await preloadMarkdown();

const pack: StudyPack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));

beforeEach(() => {
  clearExternalVerseCache();
  vi.unstubAllGlobals();
});

describe('invalid reference marker', () => {
  it('a non-existent ref is plain text + the marker, not a popover; valid refs stay links', async () => {
    stubBundledFetch();
    render(<AskAnswer text={'见 John 3:99 与 来5:14。'} pack={pack} />);
    const bad = await screen.findByTestId('invalid-ref');
    expect(bad).toHaveTextContent(`John 3:99${NO_SUCH_VERSE_MARK}`);
    expect(within(bad).queryByTestId('verse-ref')).toBeNull();
    fireEvent.mouseEnter(bad);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getAllByTestId('verse-ref').map(el => el.textContent)).toEqual(['来5:14']);
  });

  it('an unknown "book" (a time) is not a reference: no marker, no link', async () => {
    stubBundledFetch();
    render(<AskAnswer text={'聚会 at 7:30，下午3:00 祷告；见 John 3:99。'} pack={pack} />);
    // John 3:99's marker proves the check has settled before asserting absence.
    expect(await screen.findAllByTestId('no-such-verse')).toHaveLength(1);
    expect(screen.getByTestId('invalid-ref')).toHaveTextContent('John 3:99');
    expect(screen.queryAllByTestId('verse-ref')).toHaveLength(0);
    for (const time of ['at 7:30', '下午3:00']) {
      const el = screen.getByText(time);
      expect(el.closest('[data-testid="invalid-ref"]'), time).toBeNull();
      expect(el.closest('[data-testid="verse-ref"]'), time).toBeNull();
    }
  });

  it('nothing is checked while the answer streams; it renders as before', async () => {
    const fetchMock = stubBundledFetch();
    const { rerender } = render(<AskAnswer text={'见 John 3:99。'} pack={pack} complete={false} />);
    await screen.findByTestId('verse-ref');
    expect(fetchMock).not.toHaveBeenCalled();
    rerender(<AskAnswer text={'见 John 3:99。'} pack={pack} complete />);
    expect(await screen.findByTestId('no-such-verse')).toBeInTheDocument();
  });
});

describe('verses cited block (fit answer only)', () => {
  const answer = 'v.26 太6:33 · 来5:13–14 · John 3:16–20 · Romans 8:28 · Psalm 23:1 · John 3:99';

  it(`lists at most ${MAX_CITED_REFS} valid outside refs, ${MAX_CITED_VERSES} verses each then "…", in-pack and invalid refs left out`, async () => {
    stubBundledFetch();
    render(<AskAnswer text={answer} pack={pack} fit />);
    const block = await screen.findByTestId('cited-verses');
    expect(within(block).getByText(VERSES_CITED_HEADING)).toBeInTheDocument();
    expect(within(block).getAllByTestId('cited-ref-label').map(el => el.textContent)).toEqual([
      '希伯来书 5:13–14 · Hebrews 5:13–14', '约翰福音 3:16–20 · John 3:16–20', '罗马书 8:28 · Romans 8:28',
    ]);
    const [heb, john] = within(block).getAllByTestId('cited-ref');
    expect(within(heb).getAllByTestId('cited-verse')).toHaveLength(2);
    expect(within(heb).queryByTestId('cited-more')).toBeNull();
    expect(heb).toHaveTextContent('惟独长大成人的才能吃干粮');  // 和合本 5:14
    expect(heb).toHaveTextContent(/solid food is for the mature/i); // BSB 5:14
    expect(within(john).getAllByTestId('cited-verse')).toHaveLength(MAX_CITED_VERSES);
    expect(within(john).getByTestId('cited-more')).toHaveTextContent('…');
  });

  it('no block when every ref is in the pack, and never outside the fit answer', async () => {
    const fetchMock = stubBundledFetch();
    const { unmount } = render(<AskAnswer text={'v.26 与 vv.33–34'} pack={pack} fit />);
    await waitFor(() => expect(screen.getAllByTestId('verse-ref')).toHaveLength(2));
    // Let the check settle, then assert absence (not a vacuous early read).
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByTestId('cited-verses')).toBeNull();
    unmount();
    render(<AskAnswer text={'来5:14'} pack={pack} />);
    await screen.findByTestId('verse-ref');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled()); // the check ran (HEB 5 loaded)
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByTestId('cited-verses')).toBeNull();
  });
});
