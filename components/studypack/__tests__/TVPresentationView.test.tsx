import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { SAMPLE_PACK_ID, TEST_PACK_PATH } from './fixtures';
import TVPresentationView from '../TVPresentationView';


const packJson = () => JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));

// Mirror of askAIStream.ts streamStudyAI:
// (pack, slide, history, question, onText, signal) → Promise<finalText>
const streamStudyAIMock = vi.fn();
vi.mock('../askAIStream', () => ({
  streamStudyAI: (...args: unknown[]) => streamStudyAIMock(...args),
}));

function mockAnswer(text: string) {
  streamStudyAIMock.mockImplementation(
    async (_p: unknown, _s: unknown, _h: unknown, _q: unknown, onText: (t: string) => void) => {
      onText(text);
      return text;
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
    expect(screen.getByText('Do Not Be Anxious 不要忧虑')).toBeInTheDocument();
  });
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
    expect(screen.getByText('1/16')).toBeInTheDocument();
    expect(screen.getByText(/Arrow keys, click, or swipe/)).toBeInTheDocument();
  });

  it('advances through every slide with ArrowRight', async () => {
    mockFetchOk(packJson());
    await renderLoaded();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(/Scripture 经文.*· 1\/3/)).toBeInTheDocument();
    expect(screen.getByText('2/16')).toBeInTheDocument();
    // Keyboard hints only on the first slide
    expect(screen.queryByText(/Arrow keys, click, or swipe/)).not.toBeInTheDocument();
    for (let i = 0; i < 14; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('16/16')).toBeInTheDocument();
    expect(screen.getByText(/Closing 闭环/)).toBeInTheDocument();
    // Clamped at the end
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('16/16')).toBeInTheDocument();
  });

  it('renders the embedded bilingual passage across three scripture slides', async () => {
    mockFetchOk(packJson());
    await renderLoaded();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    // Part 1/3: vv.25-27, CUV and WEB side by side, no cache involved
    expect(screen.getByText(/不要為生命憂慮/)).toBeInTheDocument();
    expect(screen.getByText(/don’t be anxious for your life/)).toBeInTheDocument();
    expect(screen.queryByText(/所羅門/)).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(/Scripture 经文.*· 2\/3/)).toBeInTheDocument();
    expect(screen.getByText(/所羅門極榮華/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(/Scripture 经文.*· 3\/3/)).toBeInTheDocument();
    expect(screen.getByText(/seek first God’s Kingdom/)).toBeInTheDocument();
  });

  it('gives each discussion question its own slide', async () => {
    mockFetchOk(packJson());
    await renderLoaded();
    for (let i = 0; i < 7; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(/Where does anxiety actually show up/)).toBeInTheDocument();
    expect(screen.getByText(/Discussion 讨论 · 1\/5/)).toBeInTheDocument();
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
    expect(screen.getByText('1/16')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /Ask AI 问AI/ }));
    expect(screen.getByTestId('ask-ai-overlay')).toBeInTheDocument();
    // Opening via the button must not advance the slide
    expect(screen.getByText('1/16')).toBeInTheDocument();
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
    for (let i = 0; i < 7; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByText(/Q: Where does anxiety actually show up/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('It shows up at work (v.25).')).toBeInTheDocument());
    expect(streamStudyAIMock).toHaveBeenCalledTimes(1);
    expect(String(streamStudyAIMock.mock.calls[0][3]))
      .toContain('Where does anxiety actually show up');
  });

  it('selected slide text beats the discussion question and is sent as an explain request', async () => {
    mockAnswer('Explained (v.26).');
    configureKey();
    const removeAllRanges = vi.fn();
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => ' 飛鳥 the birds ',
      removeAllRanges,
    } as unknown as Selection);
    mockFetchOk(packJson());
    await renderLoaded();
    for (let i = 0; i < 7; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() => expect(streamStudyAIMock).toHaveBeenCalledTimes(1));
    const question = String(streamStudyAIMock.mock.calls[0][3]);
    expect(question).toContain('Explain this phrase in the context of the passage');
    expect(question).toContain('"飛鳥 the birds"');
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

  it('shows the OpenRouter not-configured message when no API key is set', async () => {
    mockFetchOk(packJson());
    await renderLoaded();
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByText(/OpenRouter API key/)).toBeInTheDocument();
    expect(streamStudyAIMock).not.toHaveBeenCalled();
  });
});
