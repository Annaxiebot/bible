/**
 * FirstTimeGuide.test.tsx — the first-visit "三步 Three steps" card on #/new · 新手三步测试
 *
 * Rendered inside the real NewStudyPage over fake-indexeddb: shown to a
 * visitor with no packs; "知道了 Got it" hides it now and after a reload
 * (remount); hidden when a pack is saved; blocked storage still shows the
 * card and still dismisses it for the session.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { STORAGE_KEYS, NEW_STUDY_GUIDE_DISMISSED_VALUE } from '../../../constants/storageKeys';
import { idbService } from '../../../services/idbService';
import { saveLocalPack } from '../../studypack/packSource';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import { NS_GUIDE_TITLE, NS_GUIDE_STEPS, NS_GUIDE_GOT_IT, NS_MY_PACKS } from '../newStudyStrings';
import NewStudyPage from '../NewStudyPage';

vi.mock('../../../services/bibleDataSource', () => ({
  fetchBundledChapter: async () => ({
    verses: Array.from({ length: 36 }, (_, i) => ({ verse: i + 1, text: `v${i + 1}` })),
  }),
}));

const getItem = window.localStorage.getItem as ReturnType<typeof vi.fn>;
const setItem = window.localStorage.setItem as ReturnType<typeof vi.fn>;

/** A working localStorage (Map-backed) holding an AI key, so the form renders. */
function workingStorage(): Map<string, string> {
  const store = new Map<string, string>([[STORAGE_KEYS.OPENROUTER_API_KEY, 'k']]);
  getItem.mockReset().mockImplementation((k: string) => store.get(k) ?? null);
  setItem.mockReset().mockImplementation((k: string, v: string) => { store.set(k, v); });
  return store;
}

/** Wait until the pack list has been read (the form is ready too). */
async function renderPage() {
  const view = render(<NewStudyPage />);
  await waitFor(() => expect(screen.getByText(NS_MY_PACKS)).toBeInTheDocument());
  await waitFor(() => expect(screen.getByTestId('ns-verse-to')).toBeEnabled());
  return view;
}

describe('FirstTimeGuide on #/new', () => {
  beforeEach(async () => {
    await idbService.clear('studypacks');
    window.location.hash = '';
  });

  it('shows the three Chinese-first steps to a first-time visitor with no packs', async () => {
    workingStorage();
    await renderPage();
    const card = await screen.findByTestId('ns-guide');
    expect(card).toHaveTextContent(NS_GUIDE_TITLE);
    for (const step of NS_GUIDE_STEPS) expect(card).toHaveTextContent(step);
    expect(NS_GUIDE_TITLE.startsWith('第一次使用')).toBe(true);
  });

  it('Got it hides the card, and it stays hidden after a reload', async () => {
    const store = workingStorage();
    const first = await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: NS_GUIDE_GOT_IT }));
    expect(screen.queryByTestId('ns-guide')).toBeNull();
    expect(store.get(STORAGE_KEYS.NEW_STUDY_GUIDE_DISMISSED)).toBe(NEW_STUDY_GUIDE_DISMISSED_VALUE);
    first.unmount();
    await renderPage();
    expect(screen.queryByTestId('ns-guide')).toBeNull();
  });

  it('is hidden when the visitor already has a saved pack', async () => {
    workingStorage();
    const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
    await saveLocalPack(assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage)));
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('pack-row')).toBeInTheDocument());
    expect(screen.queryByTestId('ns-guide')).toBeNull();
  });

  it('blocked storage: the card still renders, and Got it still hides it for the session', async () => {
    workingStorage();
    const blocked = () => { throw new Error('SecurityError: storage blocked'); };
    getItem.mockImplementation((k: string) => (k === STORAGE_KEYS.NEW_STUDY_GUIDE_DISMISSED ? blocked() : k === STORAGE_KEYS.OPENROUTER_API_KEY ? 'k' : null));
    setItem.mockImplementation((k: string) => { if (k === STORAGE_KEYS.NEW_STUDY_GUIDE_DISMISSED) blocked(); });
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: NS_GUIDE_GOT_IT }));
    expect(screen.queryByTestId('ns-guide')).toBeNull();
  });
});
