/**
 * NewStudyPage.test.tsx — the leader's flow in jsdom: no key → inline setup;
 * key → form (Chinese-first, validated) → generation (mocked pipeline) →
 * editor (editable questions, scripture read-only) → Save lists the pack
 * (real fake-indexeddb) → Preview sets the TV hash; a failed generation
 * shows the bilingual error with Retry.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { idbService } from '../../../services/idbService';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import { SETUP_TITLE } from '../../setup/setupStrings';
import {
  NS_TITLE, NS_GENERATE, NS_BOOK, NS_EDIT_TITLE, NS_SAVE, NS_SAVED, NS_PREVIEW, NS_MY_PACKS, NS_NO_PACKS,
  NS_RETRY, NS_ERR_NO_JSON, NS_ERR_RANGE, NS_SCRIPTURE_NOTE, NS_QUESTION_ADD, NS_STEP_AI,
} from '../newStudyStrings';
import NewStudyPage from '../NewStudyPage';
import { validateRequest, DEFAULT_REQUEST } from '../NewStudyForm';

const generateMock = vi.fn();
vi.mock('../generatePack', () => ({
  generateStudyPack: (...args: unknown[]) => generateMock(...args),
}));
// The form's verse dropdowns read the bundled chapter; every chapter here has 36 verses.
vi.mock('../../../services/bibleDataSource', () => ({
  fetchBundledChapter: async () => ({
    verses: Array.from({ length: 36 }, (_, i) => ({ verse: i + 1, text: `v${i + 1}` })),
  }),
}));

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const generatedPack = () => assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED));

function withKey(key: string | null) {
  (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset()
    .mockImplementation((k: string) => (k === STORAGE_KEYS.OPENROUTER_API_KEY ? key : null));
}

describe('NewStudyPage', () => {
  beforeEach(async () => {
    generateMock.mockReset();
    await idbService.clear('studypacks');
    window.location.hash = '';
  });

  it('shows the quick AI setup inline (and no form) when no key is configured', () => {
    withKey(null);
    render(<NewStudyPage />);
    expect(screen.getByText(NS_TITLE)).toBeInTheDocument();
    expect(screen.getByTestId('quick-ai-setup')).toBeInTheDocument();
    expect(screen.getByText(SETUP_TITLE)).toBeInTheDocument();
    expect(screen.queryByTestId('new-study-form')).toBeNull();
  });

  it('renders the Chinese-first form with dropdowns and never lets a bad range reach generation', async () => {
    withKey('k');
    render(<NewStudyPage />);
    expect(screen.getByLabelText(NS_BOOK)).toBeInTheDocument();
    expect(within(screen.getByTestId('ns-book')).getByText('约翰福音 John')).toBeInTheDocument();
    expect(screen.getByTestId('ns-chapter').tagName).toBe('SELECT');
    await versesReady();
    fireEvent.change(screen.getByTestId('ns-verse-to'), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId('ns-verse-from'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: NS_GENERATE }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(generateMock.mock.calls[0][0]).toMatchObject({ verseFrom: 30, verseTo: 30 });
    expect(validateRequest({ ...DEFAULT_REQUEST, verseFrom: 30, verseTo: 20 })).toBe(NS_ERR_RANGE);
  });

  const versesReady = () => waitFor(() => expect(screen.getByTestId('ns-verse-to')).toBeEnabled());

  async function fillAndGenerate() {
    fireEvent.change(screen.getByTestId('ns-book'), { target: { value: 'JHN' } });
    fireEvent.change(screen.getByTestId('ns-chapter'), { target: { value: '3' } });
    await versesReady();
    expect(screen.getByTestId('ns-verse-to')).toHaveValue('36');
    fireEvent.change(screen.getByTestId('ns-verse-from'), { target: { value: '22' } });
    fireEvent.change(screen.getByTestId('ns-date'), { target: { value: '2026-10-02' } });
    fireEvent.click(screen.getByRole('button', { name: NS_GENERATE }));
  }

  it('generates, edits, saves (listed in My packs) and previews on TV', async () => {
    withKey('k');
    generateMock.mockImplementation(async (_req: unknown, onProgress: (s: string, d?: string) => void) => {
      onProgress(NS_STEP_AI, '12');
      return generatedPack();
    });
    render(<NewStudyPage />);
    expect(screen.getByText(NS_MY_PACKS)).toBeInTheDocument();
    expect(screen.getByText(NS_NO_PACKS)).toBeInTheDocument();
    await fillAndGenerate();
    expect(generateMock.mock.calls[0][0]).toMatchObject({ bookId: 'JHN', chapter: 3, verseFrom: 22, verseTo: 36 });

    await waitFor(() => expect(screen.getByText(NS_EDIT_TITLE)).toBeInTheDocument());
    expect(screen.getByText(NS_SCRIPTURE_NOTE)).toBeInTheDocument();
    expect(screen.getByTestId('ns-scripture')).toHaveTextContent('第22节');
    const questions = within(screen.getByTestId('ns-questions')).getAllByRole('textbox');
    expect(questions).toHaveLength(5);
    fireEvent.change(questions[0], { target: { value: '改过的题 · Edited question' } });
    fireEvent.click(screen.getByRole('button', { name: NS_QUESTION_ADD }));
    expect(within(screen.getByTestId('ns-questions')).getAllByRole('textbox')).toHaveLength(6);
    // An empty new question blocks Save with a bilingual error.
    fireEvent.click(screen.getByTestId('ns-save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('讨论题不能为空');
    const added = within(screen.getByTestId('ns-questions')).getAllByRole('textbox')[5];
    fireEvent.change(added, { target: { value: '第六题 · Question six' } });

    fireEvent.click(screen.getByTestId('ns-save'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(NS_SAVED));
    const stored = await idbService.get('studypacks', 'local-2026-10-02-jhn3');
    expect(stored).toBeDefined();
    expect((stored!.pack as { sections: Array<{ kind: string; questions?: string[] }> })
      .sections.find(s => s.kind === 'discussion')!.questions![0]).toBe('改过的题 · Edited question');

    fireEvent.click(screen.getByTestId('ns-preview'));
    await waitFor(() => expect(window.location.hash).toBe('#/pack/local-2026-10-02-jhn3'));
  });

  it('shows the bilingual error with Retry when generation fails, and retries the same request', async () => {
    withKey('k');
    generateMock.mockRejectedValueOnce(new Error(NS_ERR_NO_JSON)).mockResolvedValueOnce(generatedPack());
    render(<NewStudyPage />);
    await fillAndGenerate();
    expect(await screen.findByRole('alert')).toHaveTextContent(NS_ERR_NO_JSON);
    fireEvent.click(screen.getByRole('button', { name: NS_RETRY }));
    await waitFor(() => expect(screen.getByText(NS_EDIT_TITLE)).toBeInTheDocument());
    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(generateMock.mock.calls[1][0]).toEqual(generateMock.mock.calls[0][0]);
  });

  it('lists saved packs on load and opens one into the editor', async () => {
    withKey('k');
    await idbService.put('studypacks', { id: 'local-2026-10-02-jhn3', pack: generatedPack(), savedAt: 1 });
    render(<NewStudyPage />);
    const row = await screen.findByTestId('pack-row');
    expect(row).toHaveTextContent('祂必兴旺，我必衰微');
    fireEvent.click(within(row).getByRole('button', { name: '打开 Open' }));
    expect(screen.getByText(NS_EDIT_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: NS_PREVIEW })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: NS_SAVE })).toBeInTheDocument();
  });
});
