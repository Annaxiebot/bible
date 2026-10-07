import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { TEST_PACK_PATH } from './fixtures';
import { parseStudyPack, buildSlides, StudyPack, Slide } from '../packTypes';
import { SETUP_TITLE, SETUP_OPEN_BUTTON, SETUP_CANCEL, SETUP_SIGN_IN_TO_USE_AI, SETUP_OWN_KEY_TOGGLE } from '../../setup/setupStrings';
import { ASK_AI_MODEL } from '../../../services/aiDefaults';
import { AI_CREDITS_MESSAGE, AI_EMPTY, TV_RETRY, thinkingLine, modelLine } from '../tvHints';
import { AskAIError, emptyError, timeoutError } from '../askAIErrors';

// Mirror of askAIFallback.ts streamStudyAI:
// (pack, slide, history, question, onText, signal, onModel?) → Promise<{ text, model }>,
// calling onText with the accumulated text as deltas arrive.
const streamStudyAIMock = vi.fn();
vi.mock('../askAIFallback', () => ({
  streamStudyAI: (...args: unknown[]) => streamStudyAIMock(...args),
}));

import AskAIOverlay from '../AskAIOverlay';
import { preloadMarkdown } from '../../LazyMarkdown';



function loadPack(): { pack: StudyPack; slide: Slide } {
  const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
  return { pack, slide: buildSlides(pack)[0] };
}

type OnText = (t: string) => void;

const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;
const setItemMock = window.localStorage.setItem as ReturnType<typeof vi.fn>;

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

// Warm react-markdown outside every timed budget; see preloadMarkdown() for why.
await preloadMarkdown();

beforeEach(() => {
  streamStudyAIMock.mockReset().mockImplementation(
    async (_p, _s, _h, _q, onText: OnText) => {
      onText('Answer');
      onText('Answer (v.25).');
      return { text: 'Answer (v.25).', model: ASK_AI_MODEL };
    });
  getItemMock.mockReset().mockReturnValue(null);
  setItemMock.mockReset();
});

describe('AskAIOverlay (streaming)', () => {
  it('shows no related-verses credit while the ADR-0015 switch is off', () => {
    configureKey();
    renderOverlay();
    expect(screen.queryByTestId('ask-related-credit')).toBeNull();
  });

  it('no key, signed out: the inline sign-in prompt (no key hints) and the input disabled', () => {
    renderOverlay();
    expect(screen.getByTestId('quick-ai-setup')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: SETUP_TITLE })).toBeInTheDocument();
    expect(screen.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SETUP_OWN_KEY_TOGGLE })).toBeNull();
    expect(screen.getByTestId('ask-ai-overlay').textContent).not.toMatch(/OpenRouter|密钥/);
    expect(screen.getByLabelText(/Ask AI question/)).toBeDisabled();
    expect(streamStudyAIMock).not.toHaveBeenCalled();
  });

  it('renders the answer incrementally as deltas arrive, input disabled until done', async () => {
    configureKey();
    let emit!: OnText;
    let finish!: (t: string) => void;
    streamStudyAIMock.mockImplementation((_p, _s, _h, _q, onText: OnText) => {
      emit = onText;
      return new Promise<{ text: string; model: string }>(resolve => {
        finish = (t: string) => resolve({ text: t, model: 'served/model' });
      });
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
    // The model that answered is shown under the answer
    expect(screen.getByTestId('ask-model')).toHaveTextContent(modelLine('served/model'));
  });

  it('while waiting, the thinking line names the model so a stuck state is identifiable', async () => {
    configureKey();
    let onModel!: (m: string) => void;
    streamStudyAIMock.mockImplementation((_p, _s, _h, _q, _t, _sig, cb: (m: string) => void) => {
      onModel = cb;
      return new Promise(() => undefined); // never resolves
    });
    renderOverlay(vi.fn(), 'auto question');
    await waitFor(() => expect(screen.getByTestId('ask-thinking')).toHaveTextContent(thinkingLine(ASK_AI_MODEL)));
    act(() => onModel('google/gemini-2.5-flash-lite'));
    expect(screen.getByTestId('ask-thinking')).toHaveTextContent(thinkingLine('google/gemini-2.5-flash-lite'));
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

  it('does not auto-send when AI is unavailable (no key, signed out)', () => {
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
      return new Promise<{ text: string; model: string }>(resolve => {
        sig.addEventListener('abort', () => resolve({ text: 'partial', model: ASK_AI_MODEL }));
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

  it('surfaces an untyped transport error in the overlay with a Retry button (never swallowed)', async () => {
    configureKey();
    streamStudyAIMock.mockRejectedValue(new Error('OpenRouter API error: 429'));
    renderOverlay();
    fireEvent.change(screen.getByLabelText(/Ask AI question/), { target: { value: 'q' } });
    fireEvent.click(screen.getByRole('button', { name: /提问 Ask/ }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('OpenRouter API error: 429');
    });
    expect(screen.getByRole('button', { name: TV_RETRY })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SETUP_OPEN_BUTTON })).toBeNull();
  });

  it('a credits (402) error shows the bilingual line with a Set up AI button that opens the inline form', async () => {
    configureKey();
    streamStudyAIMock.mockRejectedValue(new AskAIError('no-credits', `${AI_CREDITS_MESSAGE} · HTTP 402: Insufficient credits`, ASK_AI_MODEL, 402));
    renderOverlay(vi.fn(), 'auto question');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(AI_CREDITS_MESSAGE));
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 402');
    expect(screen.queryByTestId('quick-ai-setup')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: SETUP_OPEN_BUTTON }));
    expect(screen.getByTestId('quick-ai-setup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: SETUP_CANCEL }));
    expect(screen.queryByTestId('quick-ai-setup')).toBeNull();
  });

  it('a timeout shows the bilingual line with the model id, Retry and Set up AI', async () => {
    configureKey();
    streamStudyAIMock.mockRejectedValue(timeoutError(ASK_AI_MODEL, 20_000));
    renderOverlay(vi.fn(), 'auto question');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(modelLine(ASK_AI_MODEL)));
    expect(screen.getByRole('button', { name: TV_RETRY })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SETUP_OPEN_BUTTON })).toBeInTheDocument();
  });

  it('an empty answer is an error; Retry re-sends the same question without duplicating it', async () => {
    configureKey();
    streamStudyAIMock.mockRejectedValueOnce(emptyError('served/model', null));
    renderOverlay(vi.fn(), 'auto question');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(AI_EMPTY));
    expect(screen.getByRole('alert')).toHaveTextContent(modelLine('served/model'));
    fireEvent.click(screen.getByRole('button', { name: TV_RETRY }));
    await waitFor(() => expect(streamStudyAIMock).toHaveBeenCalledTimes(2));
    expect(streamStudyAIMock.mock.calls[1][2]).toEqual([]); // same (empty) history
    expect(streamStudyAIMock.mock.calls[1][3]).toBe('auto question');
    await waitFor(() => expect(screen.getByTestId('ask-answer')).toHaveTextContent('Answer (v.25).'));
    expect(screen.getAllByText('Q: auto question')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('closes on Escape and on the close button', () => {
    const { onClose } = renderOverlay();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText(/Close Ask AI/));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('AskAIOverlay text selection', () => {
  it('lets the mouse select answer text (the TV root is select-none)', () => {
    renderOverlay();
    expect(screen.getByTestId('ask-ai-overlay').className).toContain('select-text');
  });
});
