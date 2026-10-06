/**
 * TVFullscreen.test.tsx — full screen inside TV mode · 演示全屏测试
 *
 * F toggles (not with Cmd/Ctrl, not while Ask AI is open, not in a text
 * field); an Escape that only leaves full screen never also leaves TV mode,
 * whether its keydown lands before or just after the browser's exit; the
 * click that opened TV mode is used on mount when it is still a gesture;
 * ✕ leaves full screen with the deck; the one-time hint shows for 4 s,
 * once; iPhone gets the sideways hint and no request; a denied request
 * leaves the deck working windowed.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { SAMPLE_PACK_ID, TEST_PACK_PATH } from './fixtures';
import TVPresentationView from '../TVPresentationView';
import { preloadMarkdown } from '../../LazyMarkdown';
import { FULLSCREEN_HINT, SIDEWAYS_HINT, FIRST_SLIDE_HINT } from '../tvHints';
import { PORTRAIT_PHONE_QUERY } from '../slideTypography';
import { FULLSCREEN_HINT_MS, ESCAPE_GRACE_MS } from '../useTVFullscreen';
import { installFakeFullscreen, FakeFullscreen } from './fakeFullscreen';

await preloadMarkdown();

const getItem = window.localStorage.getItem as ReturnType<typeof vi.fn>;
const setItem = window.localStorage.setItem as ReturnType<typeof vi.fn>;
let fake: FakeFullscreen | null = null;

async function renderLoaded(onExit = vi.fn()) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, json: () => Promise.resolve(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'))),
  }));
  render(<TVPresentationView packId={SAMPLE_PACK_ID} onExit={onExit} />);
  await waitFor(() => expect(screen.getByText('不要忧虑 Do Not Be Anxious')).toBeInTheDocument());
  await act(async () => {}); // flush the passive effects that attach the key listeners
  return onExit;
}

function portraitPhone(matches: boolean) {
  (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
    matches: matches && query === PORTRAIT_PHONE_QUERY, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  getItem.mockReset().mockReturnValue(null);
  setItem.mockReset();
  portraitPhone(false);
});
afterEach(() => {
  fake?.uninstall();
  fake = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('TV mode full screen', () => {
  it('F toggles full screen; Cmd/Ctrl+F and F in a text field do nothing', async () => {
    fake = installFakeFullscreen();
    await renderLoaded();
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'f' });
    input.remove();
    expect(fake.request).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'f' });
    expect(fake.request).toHaveBeenCalledTimes(1);
    expect(document.fullscreenElement).toBe(document.documentElement);
    fireEvent.keyDown(window, { key: 'F' });
    expect(fake.exit).toHaveBeenCalledTimes(1);
    expect(document.fullscreenElement).toBeNull();
  });

  it('F is ignored while Ask AI is open (typing a question)', async () => {
    fake = installFakeFullscreen();
    await renderLoaded();
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByTestId('ask-ai-overlay')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'f' });
    expect(fake.request).not.toHaveBeenCalled();
  });

  it('Escape whose keydown arrives while still full screen leaves full screen only; the next Escape leaves TV mode', async () => {
    fake = installFakeFullscreen();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const onExit = await renderLoaded();
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(fake.exit).toHaveBeenCalledTimes(1);
    expect(document.fullscreenElement).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
    now.mockReturnValue(1000 + ESCAPE_GRACE_MS + 1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('Escape whose keydown arrives just after the browser left full screen does not also leave TV mode', async () => {
    fake = installFakeFullscreen();
    const now = vi.spyOn(performance, 'now').mockReturnValue(5000);
    const onExit = await renderLoaded();
    fireEvent.keyDown(window, { key: 'f' });
    act(() => fake!.browserExit());
    now.mockReturnValue(5000 + ESCAPE_GRACE_MS - 100);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('Escape while windowed still leaves TV mode at once', async () => {
    fake = installFakeFullscreen();
    const onExit = await renderLoaded();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(fake.exit).not.toHaveBeenCalled();
  });

  it('✕ leaves full screen together with TV mode', async () => {
    fake = installFakeFullscreen();
    const onExit = await renderLoaded();
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.click(screen.getByLabelText(/Exit presentation/));
    expect(fake.exit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('a direct load (no click) requests nothing on mount', async () => {
    fake = installFakeFullscreen();
    await renderLoaded();
    expect(fake.request).not.toHaveBeenCalled();
  });

  it('uses the opening click on mount when it is still a gesture (a link we do not own, e.g. the landing)', async () => {
    fake = installFakeFullscreen();
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { userActivation: { isActive: true } }));
    await renderLoaded();
    expect(fake.request).toHaveBeenCalledTimes(1);
  });

  it('a denied request leaves the deck working windowed', async () => {
    fake = installFakeFullscreen({ deny: true });
    await renderLoaded();
    fireEvent.keyDown(window, { key: 'f' });
    await act(async () => {});
    expect(fake.request).toHaveBeenCalledTimes(1);
    expect(document.fullscreenElement).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('tv-counter')).toHaveTextContent(/^2\//);
  });
});

describe('one-time full-screen hint', () => {
  it('shows "按 F 全屏" above the first-slide hint for 4 s, once, and remembers it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fake = installFakeFullscreen();
    await renderLoaded();
    expect(screen.getByTestId('tv-fullscreen-hint')).toHaveTextContent(FULLSCREEN_HINT);
    expect(screen.getByText(FIRST_SLIDE_HINT)).toBeInTheDocument();
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEYS.TV_FULLSCREEN_HINT_SEEN, '1');
    act(() => { vi.advanceTimersByTime(FULLSCREEN_HINT_MS); });
    expect(screen.queryByTestId('tv-fullscreen-hint')).not.toBeInTheDocument();
    expect(screen.getByText(FIRST_SLIDE_HINT)).toBeInTheDocument();
  });

  it('is not shown again once seen', async () => {
    getItem.mockImplementation((key: string) => (key === STORAGE_KEYS.TV_FULLSCREEN_HINT_SEEN ? '1' : null));
    fake = installFakeFullscreen();
    await renderLoaded();
    expect(screen.queryByTestId('tv-fullscreen-hint')).not.toBeInTheDocument();
  });

  it('hides as soon as the deck goes full screen', async () => {
    fake = installFakeFullscreen();
    await renderLoaded();
    expect(screen.getByTestId('tv-fullscreen-hint')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.queryByTestId('tv-fullscreen-hint')).not.toBeInTheDocument();
  });

  it('still works when storage is blocked (private mode)', async () => {
    getItem.mockImplementation(() => { throw new Error('SecurityError'); });
    setItem.mockImplementation(() => { throw new Error('SecurityError'); });
    fake = installFakeFullscreen();
    await renderLoaded();
    expect(screen.getByTestId('tv-fullscreen-hint')).toHaveTextContent(FULLSCREEN_HINT);
  });

  it('iPhone held upright (no full-screen API): the sideways hint, and F requests nothing', async () => {
    portraitPhone(true);
    await renderLoaded();
    expect(screen.getByTestId('tv-fullscreen-hint')).toHaveTextContent(SIDEWAYS_HINT);
    expect(() => fireEvent.keyDown(window, { key: 'f' })).not.toThrow();
    expect(document.fullscreenElement ?? null).toBeNull();
  });

  it('no API and not an upright phone: no hint at all', async () => {
    await renderLoaded();
    expect(screen.queryByTestId('tv-fullscreen-hint')).not.toBeInTheDocument();
  });
});
