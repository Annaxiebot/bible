import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { TEST_PACK_PATH } from './fixtures';
import { parseStudyPack, buildSlides, StudyPack, Slide } from '../packTypes';

// Mirror of askAIStream.ts streamStudyAI:
// (pack, slide, history, question, onText, signal) → Promise<finalText>,
// calling onText with the accumulated text as deltas arrive.
const streamStudyAIMock = vi.fn();
vi.mock('../askAIStream', () => ({
  streamStudyAI: (...args: unknown[]) => streamStudyAIMock(...args),
}));

import AskAIOverlay from '../AskAIOverlay';



function loadPack(): { pack: StudyPack; slide: Slide } {
  const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
  return { pack, slide: buildSlides(pack)[0] };
}

type OnText = (t: string) => void;

const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;

function configureKey() {
  getItemMock.mockImplementation((key: string) =>
    key === STORAGE_KEYS.OPENROUTER_API_KEY ? 'test-key' : null
  );
}

function renderOverlay(onClose = vi.fn(), initialQuestion: string | null = null) {
  const { pack, slide } = loadPack();
  const view = render(
    <AskAIOverlay pack={pack} slide={slide} initialQuestion={initialQuestion} onClose={onClose} />
  );
  return { onClose, view };
}

beforeEach(() => {
  streamStudyAIMock.mockReset().mockImplementation(
    async (_p, _s, _h, _q, onText: OnText) => {
      onText('Answer');
      onText('Answer (v.25).');
      return 'Answer (v.25).';
    });
  getItemMock.mockReset().mockReturnValue(null);
});

describe('AskAIOverlay (streaming)', () => {
  it('shows the OpenRouter setup message and disables input when unconfigured', () => {
    renderOverlay();
    expect(screen.getByRole('alert')).toHaveTextContent(/OpenRouter API key/);
    expect(screen.getByLabelText(/Ask AI question/)).toBeDisabled();
    expect(streamStudyAIMock).not.toHaveBeenCalled();
  });

  it('renders the answer incrementally as deltas arrive, input disabled until done', async () => {
    configureKey();
    let emit!: OnText;
    let finish!: (t: string) => void;
    streamStudyAIMock.mockImplementation((_p, _s, _h, _q, onText: OnText) => {
      emit = onText;
      return new Promise<string>(resolve => { finish = resolve; });
    });
    renderOverlay();
    fireEvent.change(screen.getByLabelText(/Ask AI question/), { target: { value: 'Why birds?' } });
    fireEvent.click(screen.getByRole('button', { name: /提问 Ask/ }));
    expect(screen.getByText('Q: Why birds?')).toBeInTheDocument();

    act(() => emit('Anxiety '));
    // Markdown renders lazily, so assert through waitFor
    await waitFor(() =>
      expect(screen.getByTestId('streaming-answer')).toHaveTextContent('Anxiety'));
    expect(screen.getByLabelText(/Ask AI question/)).toBeDisabled(); // mid-stream

    act(() => emit('Anxiety follows (v.25).'));
    await waitFor(() =>
      expect(screen.getByTestId('streaming-answer')).toHaveTextContent('Anxiety follows (v.25).'));

    await act(async () => { finish('Anxiety follows (v.25).'); });
    expect(screen.queryByTestId('streaming-answer')).not.toBeInTheDocument();
    await waitFor(() => // now a finished message (markdown + verse-ref tooltip)
      expect(screen.getByTestId('ask-answer')).toHaveTextContent('Anxiety follows (v.25).'));
    expect(screen.getByTestId('verse-ref')).toHaveTextContent('v.25');
    expect(screen.getByLabelText(/Ask AI question/)).toBeEnabled();
  });

  it('auto-sends an initial question exactly once and keeps the input for follow-ups', async () => {
    configureKey();
    renderOverlay(vi.fn(), 'Where does anxiety show up?');
    expect(screen.getByText('Q: Where does anxiety show up?')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('ask-answer')).toHaveTextContent('Answer (v.25).'));
    expect(streamStudyAIMock).toHaveBeenCalledTimes(1);
    expect(streamStudyAIMock.mock.calls[0][3]).toBe('Where does anxiety show up?');
    await waitFor(() => expect(screen.getByLabelText(/Ask AI question/)).toBeEnabled());
  });

  it('does not auto-send when the provider is unconfigured', () => {
    renderOverlay(vi.fn(), 'auto question');
    expect(streamStudyAIMock).not.toHaveBeenCalled();
  });

  it('sends prior Q&A as history on a follow-up question', async () => {
    configureKey();
    renderOverlay();
    const input = screen.getByLabelText(/Ask AI question/);
    fireEvent.change(input, { target: { value: 'first q' } });
    fireEvent.click(screen.getByRole('button', { name: /提问 Ask/ }));
    await waitFor(() =>
      expect(screen.getByTestId('ask-answer')).toHaveTextContent('Answer (v.25).'));
    fireEvent.change(input, { target: { value: 'go deeper' } });
    fireEvent.click(screen.getByRole('button', { name: /提问 Ask/ }));
    await waitFor(() => expect(streamStudyAIMock).toHaveBeenCalledTimes(2));
    expect(streamStudyAIMock.mock.calls[1][2]).toEqual([
      { role: 'user', content: 'first q' },
      { role: 'assistant', content: 'Answer (v.25).' },
    ]);
  });

  it('aborts the in-flight stream when the overlay is closed (Escape)', async () => {
    configureKey();
    let signal!: AbortSignal;
    streamStudyAIMock.mockImplementation((_p, _s, _h, _q, onText: OnText, sig: AbortSignal) => {
      signal = sig;
      onText('partial');
      return new Promise<string>(resolve => {
        sig.addEventListener('abort', () => resolve('partial'));
      });
    });
    const { onClose } = renderOverlay(vi.fn(), 'auto question');
    await waitFor(() =>
      expect(screen.getByTestId('streaming-answer')).toHaveTextContent('partial'));
    expect(signal.aborted).toBe(false);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(signal.aborted).toBe(true); // clean cancel, no error surfaced
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces provider errors in the overlay', async () => {
    configureKey();
    streamStudyAIMock.mockRejectedValue(new Error('OpenRouter API error: 429'));
    renderOverlay();
    fireEvent.change(screen.getByLabelText(/Ask AI question/), { target: { value: 'q' } });
    fireEvent.click(screen.getByRole('button', { name: /提问 Ask/ }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('OpenRouter API error: 429');
    });
  });

  it('treats an empty final answer as an error, not a clean result', async () => {
    configureKey();
    streamStudyAIMock.mockResolvedValue('');
    renderOverlay(vi.fn(), 'auto question');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Empty response/);
    });
  });

  it('closes on Escape and on the close button', () => {
    const { onClose } = renderOverlay();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText(/Close Ask AI/));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
