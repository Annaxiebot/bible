import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { SAMPLE_PACK_ID, TEST_PACK_PATH } from './fixtures';
import TVPresentationView from '../TVPresentationView';
import { preloadMarkdown } from '../../LazyMarkdown';
import { FIRST_SLIDE_HINT, ASK_AI_LABEL } from '../tvHints';
import { SETUP_TITLE } from '../../setup/setupStrings';

// Warm react-markdown outside every timed budget; see preloadMarkdown() for why.
await preloadMarkdown();


const packJson = () => JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));

// Demo pack slide map (pinned in packTypes.test.ts): 1 title, 2–6 scripture
// 1/5–5/5, … 13–17 discussion, … 23 closing.
const DEMO_SLIDES = 23;
const TO_FIRST_DISCUSSION = 12; // ArrowRight presses from the title slide

// Mirror of askAIFallback.ts streamStudyAI:
// (pack, slide, history, question, onText, signal, onModel?) → Promise<{ text, model }>
const streamStudyAIMock = vi.fn();
vi.mock('../askAIFallback', () => ({
  streamStudyAI: (...args: unknown[]) => streamStudyAIMock(...args),
}));

function mockAnswer(text: string) {
  streamStudyAIMock.mockImplementation(
    async (_p: unknown, _s: unknown, _h: unknown, _q: unknown, onText: (t: string) => void) => {
      onText(text);
      return { text, model: 'test/model' };
    });
}

function mockFetchOk(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderLoaded(onExit = vi.fn()) {
  render(<TVPresentationView packId={SAMPLE_PACK_ID} onExit={onExit} />);
  await waitFor(() => {
    expect(screen.getByText('不要忧虑 Do Not Be Anxious')).toBeInTheDocument();
  });
  // waitFor resolves on the DOM commit; the passive effects that (re)attach
  // window listeners may still be queued. Flush them so the keydowns below
  // never race the scheduler (the root of the old ArrowRight flake).
  await act(async () => {});
  return onExit;
}

describe('TVPresentationView', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks(); // drops per-test spies (e.g. window.getSelection)
    streamStudyAIMock.mockReset();
    // setup.ts mocks localStorage; no key stubbed → Ask-AI is unconfigured here.
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset().mockReturnValue(null);
  });

  it('fetches the pack by id and renders the title slide with counter and hints', async () => {
    const fetchMock = mockFetchOk(packJson());
    await renderLoaded();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`packs/${SAMPLE_PACK_ID}.json`);
    expect(screen.getByText(`1/${DEMO_SLIDES}`)).toBeInTheDocument();
    // Pinned hint: must match the actual inputs (no click nav; select-to-ask)
    expect(screen.getByText(FIRST_SLIDE_HINT)).toBeInTheDocument();
  });

  it('advances through every slide with ArrowRight', async () => {
    mockFetchOk(packJson());
    await renderLoaded();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: /经文 Scripture.*· 1\/5/ })).toBeInTheDocument();
    expect(screen.getByText(`2/${DEMO_SLIDES}`)).toBeInTheDocument();
    // Keyboard hints only on the first slide
    expect(screen.queryByText(/Arrow keys or swipe/)).not.toBeInTheDocument();
    for (let i = 0; i < DEMO_SLIDES - 2; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(`${DEMO_SLIDES}/${DEMO_SLIDES}`)).toBeInTheDocument();
    expect(screen.getByText(/闭环 Closing/)).toBeInTheDocument();
    // Clamped at the end
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(`${DEMO_SLIDES}/${DEMO_SLIDES}`)).toBeInTheDocument();
  });

  it('renders the embedded bilingual passage across five scripture slides', async () => {
    mockFetchOk(packJson());
    await renderLoaded();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    // Part 1/5: v.25 under the key phrase, CUV and BSB side by side, no cache involved.
    // The key phrase is gold where it occurs, so the verse text spans several runs.
    const verse25 = (t: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === t;
    expect(screen.getByText(verse25('25「所以我告诉你们，不要为生命忧虑吃甚么，喝甚么；为身体忧虑穿甚么。生命不胜于饮食么？身体不胜于衣裳么？'))).toBeInTheDocument();
    expect(screen.getAllByTestId('verse-emphasis').map(e => e.textContent)).toEqual(['不要为生命忧虑', 'do not worry about your life']);
    expect(screen.getByTestId('key-phrase')).toHaveTextContent('不要为生命忧虑');
    expect(screen.queryByText(/所罗门/)).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: /经文 Scripture.*· 3\/5/ })).toBeInTheDocument();
    expect(screen.getByText(/所罗门极荣华/)).toBeInTheDocument();
    expect(screen.queryByTestId('key-phrase')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: /经文 Scripture.*· 5\/5/ })).toBeInTheDocument();
    expect(screen.getByText(/seek first the kingdom of God/)).toBeInTheDocument();
  });

  it('shows a quiet progress bar that tracks the counter', async () => {
    mockFetchOk(packJson());
    await renderLoaded();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', String(DEMO_SLIDES));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('tv-counter')).toHaveTextContent(`2/${DEMO_SLIDES}`);
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe(`${(2 / DEMO_SLIDES) * 100}%`);
  });

  it('gives each discussion question its own slide', async () => {
    mockFetchOk(packJson());
    await renderLoaded();
    for (let i = 0; i < TO_FIRST_DISCUSSION; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(/Where does anxiety actually show up/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /讨论 Discussion · 1\/5/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(/serving two masters/)).toBeInTheDocument();
  });

  it('calls onExit on Escape and on the exit button', async () => {
    mockFetchOk(packJson());
    const onExit = await renderLoaded();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText(/Exit presentation/));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('shows an error when the pack fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    render(<TVPresentationView packId="nope" onExit={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('HTTP 404');
    });
  });

  it('shows an error when the pack JSON is malformed', async () => {
    mockFetchOk({ id: 'x' });
    render(<TVPresentationView packId="x" onExit={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('missing required string field');
    });
  });

  it('opens the Ask-AI overlay with "a", suspends nav, Escape closes overlay not TV', async () => {
    mockFetchOk(packJson());
    const onExit = await renderLoaded();
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByTestId('ask-ai-overlay')).toBeInTheDocument();
    // Slide position kept, and nav keys no longer flip slides
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByText(`1/${DEMO_SLIDES}`)).toBeInTheDocument();
    // Escape closes the overlay first; TV mode stays
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('ask-ai-overlay')).not.toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
    // A second Escape now exits TV mode
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('opens the overlay from the persistent Ask AI button', async () => {
    mockFetchOk(packJson());
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: ASK_AI_LABEL }));
    expect(screen.getByTestId('ask-ai-overlay')).toBeInTheDocument();
    // Opening via the button must not advance the slide
    expect(screen.getByText(`1/${DEMO_SLIDES}`)).toBeInTheDocument();
  });

  function configureKey() {
    (window.localStorage.getItem as ReturnType<typeof vi.fn>)
      .mockImplementation((key: string) => key === STORAGE_KEYS.OPENROUTER_API_KEY ? 'test-key' : null);
  }

  it('auto-sends the discussion question when Ask AI opens on a discussion slide', async () => {
    mockAnswer('It shows up at work (v.25).');
    configureKey();
    mockFetchOk(packJson());
    await renderLoaded();
    for (let i = 0; i < TO_FIRST_DISCUSSION; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByTestId('ask-question')).toHaveTextContent(/这一周，忧虑实际出现在哪里/);
    await waitFor(() =>
      expect(screen.getByTestId('ask-answer')).toHaveTextContent('It shows up at work (v.25).'));
    expect(streamStudyAIMock).toHaveBeenCalledTimes(1);
    expect(String(streamStudyAIMock.mock.calls[0][3]))
      .toContain('Where does anxiety actually show up');
  });

  it('selected slide text beats the discussion question and is sent as an explain request', async () => {
    mockAnswer('Explained (v.26).');
    configureKey();
    const removeAllRanges = vi.fn();
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => ' 飞鸟 the birds ',
      removeAllRanges,
    } as unknown as Selection);
    mockFetchOk(packJson());
    await renderLoaded();
    for (let i = 0; i < TO_FIRST_DISCUSSION; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() => expect(streamStudyAIMock).toHaveBeenCalledTimes(1));
    const question = String(streamStudyAIMock.mock.calls[0][3]);
    expect(question).toContain('「飞鸟 the birds」在这段经文中是什么意思');
    expect(question).toContain('historical and cultural background');
    expect(question).not.toContain('Where does anxiety');
    expect(removeAllRanges).toHaveBeenCalled(); // selection cleared after sending
  });

  it('opens with an empty input on non-discussion slides with no selection', async () => {
    configureKey();
    mockFetchOk(packJson());
    await renderLoaded();
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByTestId('ask-ai-overlay')).toBeInTheDocument();
    expect(streamStudyAIMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Ask AI question/)).toHaveValue('');
  });

  it('shows the inline key setup in the overlay when no API key is set', async () => {
    mockFetchOk(packJson());
    await renderLoaded();
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByTestId('quick-ai-setup')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: SETUP_TITLE })).toBeInTheDocument();
    expect(streamStudyAIMock).not.toHaveBeenCalled();
  });
});
