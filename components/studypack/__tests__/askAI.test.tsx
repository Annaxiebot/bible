import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import path from 'path';
import React from 'react';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { parseStudyPack, buildSlides, StudyPack, Slide } from '../packTypes';
import AskAIOverlay from '../AskAIOverlay';

const PACK_PATH = path.resolve(__dirname, '../../../public/packs/2026-10-02-matt6.json');

// Mirror of services/openrouter.ts chatWithAI:
// (prompt: string, history: {role, content}[], options: {model?, useFreeRouter?, fast?}) → Promise<{text, model}>
const chatWithAIMock = vi.fn();
vi.mock('../../../services/openrouter', () => ({
  chatWithAI: (...args: unknown[]) => chatWithAIMock(...args),
}));

// Imported AFTER the mock so the adapter binds to the mocked provider.
import {
  buildAskAIPrompt,
  askStudyAI,
  questionForSelection,
  ASK_AI_MODEL,
  ASK_AI_MAX_TOKENS,
} from '../askAI';

function loadPack(): { pack: StudyPack; slide: Slide } {
  const pack = parseStudyPack(JSON.parse(readFileSync(PACK_PATH, 'utf-8')));
  return { pack, slide: buildSlides(pack)[0] };
}

// tests/utils/setup.ts replaces localStorage with a vi.fn mock, so the key
// is "configured" by stubbing getItem rather than via setItem.
const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;

beforeEach(() => {
  chatWithAIMock.mockReset().mockResolvedValue({ text: 'Answer (v.25).', model: ASK_AI_MODEL });
  getItemMock.mockReset().mockReturnValue(null);
});

describe('buildAskAIPrompt', () => {
  it('embeds the full bilingual passage, the current slide, and the contract', () => {
    const { pack, slide } = loadPack();
    const prompt = buildAskAIPrompt(pack, slide, 'Why birds?');
    expect(prompt).toContain('Matthew 6:25–34');
    expect(prompt).toContain('不要為生命憂慮');                 // CUV v.25
    expect(prompt).toContain('don’t be anxious for tomorrow');  // WEB v.34
    expect(prompt).toContain(slide.heading);                    // current slide content
    expect(prompt).toContain('2 short');
    expect(prompt).toContain('~60 words');
    expect(prompt).toContain('language of the question');
    expect(prompt).toContain('citing the verse');
    expect(prompt).toContain('QUESTION: Why birds?');
  });

  it('includes every scripture section of the current pack (john3 has two)', () => {
    const JOHN_PATH = path.resolve(__dirname, '../../../public/packs/2026-10-02-john3.json');
    const pack = parseStudyPack(JSON.parse(readFileSync(JOHN_PATH, 'utf-8')));
    const scriptures = pack.sections.filter(s => s.kind === 'scripture');
    expect(scriptures).toHaveLength(2);
    const prompt = buildAskAIPrompt(pack, buildSlides(pack)[0], 'q');
    for (const section of scriptures) {
      expect(prompt).toContain(`[${section.heading}]`);
      expect(prompt).toContain(section.verses![0].cuv);
      expect(prompt).toContain(section.verses![section.verses!.length - 1].web);
    }
  });
});

describe('questionForSelection', () => {
  it('frames the selected text as a cite-the-verse explain request', () => {
    const q = questionForSelection('treasures in heaven');
    expect(q).toContain('Explain this phrase in the context of the passage');
    expect(q).toContain('cite the verse');
    expect(q).toContain('"treasures in heaven"');
  });
});

describe('askStudyAI', () => {
  it('calls OpenRouter with the pinned model and passes the conversation history', async () => {
    const { pack, slide } = loadPack();
    const history = [
      { role: 'user' as const, content: 'first q' },
      { role: 'assistant' as const, content: 'first a' },
    ];
    await askStudyAI(pack, slide, history, 'follow-up');
    expect(chatWithAIMock).toHaveBeenCalledTimes(1);
    const [prompt, passedHistory, options] = chatWithAIMock.mock.calls[0];
    expect(String(prompt)).toContain('QUESTION: follow-up');
    expect(passedHistory).toEqual(history);
    expect(options).toMatchObject({
      model: ASK_AI_MODEL,
      useFreeRouter: false,
      maxTokens: ASK_AI_MAX_TOKENS,
    });
  });

  it('strips the bilingual [SPLIT] marker from provider output', async () => {
    const { pack, slide } = loadPack();
    chatWithAIMock.mockResolvedValue({ text: '中文 (v.25)。\n[SPLIT]\nEnglish (v.25).', model: 'm' });
    const text = await askStudyAI(pack, slide, [], 'q');
    expect(text).not.toContain('[SPLIT]');
    expect(text).toContain('中文 (v.25)。');
    expect(text).toContain('English (v.25).');
  });
});

describe('AskAIOverlay', () => {
  function renderOverlay(onClose = vi.fn(), initialQuestion: string | null = null) {
    const { pack, slide } = loadPack();
    render(
      <AskAIOverlay pack={pack} slide={slide} initialQuestion={initialQuestion} onClose={onClose} />
    );
    return onClose;
  }

  function configureKey() {
    getItemMock.mockImplementation((key: string) =>
      key === STORAGE_KEYS.OPENROUTER_API_KEY ? 'test-key' : null
    );
  }

  it('shows the OpenRouter setup message and disables input when unconfigured', () => {
    renderOverlay();
    expect(screen.getByRole('alert')).toHaveTextContent(/OpenRouter API key/);
    expect(screen.getByLabelText(/Ask AI question/)).toBeDisabled();
    expect(chatWithAIMock).not.toHaveBeenCalled();
  });

  it('submits a question and renders the grounded answer', async () => {
    configureKey();
    renderOverlay();
    fireEvent.change(screen.getByLabelText(/Ask AI question/), { target: { value: 'Why birds?' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask 提问/ }));
    expect(screen.getByText('Q: Why birds?')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Answer (v.25).')).toBeInTheDocument());
  });

  it('sends prior Q&A as history on a follow-up question', async () => {
    configureKey();
    renderOverlay();
    const input = screen.getByLabelText(/Ask AI question/);
    fireEvent.change(input, { target: { value: 'first q' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask 提问/ }));
    await waitFor(() => expect(screen.getByText('Answer (v.25).')).toBeInTheDocument());
    fireEvent.change(input, { target: { value: 'go deeper' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask 提问/ }));
    await waitFor(() => expect(chatWithAIMock).toHaveBeenCalledTimes(2));
    const [, history] = chatWithAIMock.mock.calls[1];
    expect(history).toEqual([
      { role: 'user', content: 'first q' },
      { role: 'assistant', content: 'Answer (v.25).' },
    ]);
  });

  it('surfaces provider errors in the overlay', async () => {
    configureKey();
    chatWithAIMock.mockRejectedValue(new Error('OpenRouter API error: 429'));
    renderOverlay();
    fireEvent.change(screen.getByLabelText(/Ask AI question/), { target: { value: 'q' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask 提问/ }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('OpenRouter API error: 429');
    });
  });

  it('auto-sends an initial question exactly once and keeps the input for follow-ups', async () => {
    configureKey();
    renderOverlay(vi.fn(), 'Where does anxiety show up?');
    expect(screen.getByText('Q: Where does anxiety show up?')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Answer (v.25).')).toBeInTheDocument());
    expect(chatWithAIMock).toHaveBeenCalledTimes(1);
    expect(String(chatWithAIMock.mock.calls[0][0])).toContain('QUESTION: Where does anxiety show up?');
    await waitFor(() => expect(screen.getByLabelText(/Ask AI question/)).toBeEnabled());
  });

  it('does not auto-send when the provider is unconfigured', () => {
    renderOverlay(vi.fn(), 'auto question');
    expect(chatWithAIMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/OpenRouter API key/);
  });

  it('closes on Escape and on the close button', () => {
    const onClose = renderOverlay();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText(/Close Ask AI/));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
