/**
 * fullscreen.test.tsx — the Fullscreen helper and the clicks that use it · 全屏辅助测试
 *
 * Standard API first, webkit fallback (Safari), nothing at all on iPhone;
 * a denied request is swallowed (no unhandled rejection, which vitest
 * would fail the run on); the leader's Present link requests full screen
 * inside its own click, the gesture the browser requires.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  requestFullscreen, exitFullscreen, toggleFullscreen, fullscreenSupported, fullscreenElement, hasTransientActivation,
} from '../fullscreen';
import { installFakeFullscreen, FakeFullscreen } from './fakeFullscreen';
import { LeaderPackRow } from '../../leader/LeaderPackRow';
import { parseStudyPack } from '../packTypes';
import { readFileSync } from 'fs';
import { TEST_PACK_PATH } from './fixtures';

let fake: FakeFullscreen | null = null;
afterEach(() => { fake?.uninstall(); fake = null; vi.unstubAllGlobals(); });

describe('fullscreen helper', () => {
  it('requests on the document element, then toggles back out', () => {
    fake = installFakeFullscreen();
    expect(fullscreenSupported()).toBe(true);
    toggleFullscreen();
    expect(fake.request).toHaveBeenCalledTimes(1);
    expect(fullscreenElement()).toBe(document.documentElement);
    requestFullscreen(); // already full screen: no second request
    expect(fake.request).toHaveBeenCalledTimes(1);
    toggleFullscreen();
    expect(fake.exit).toHaveBeenCalledTimes(1);
    expect(fullscreenElement()).toBeNull();
    exitFullscreen(); // already windowed: nothing to exit
    expect(fake.exit).toHaveBeenCalledTimes(1);
  });

  it('falls back to webkitRequestFullscreen (older Safari)', () => {
    const webkit = vi.fn();
    Object.defineProperty(document.documentElement, 'webkitRequestFullscreen', { configurable: true, value: webkit });
    try {
      expect(fullscreenSupported()).toBe(true);
      requestFullscreen();
      expect(webkit).toHaveBeenCalledTimes(1);
    } finally {
      delete (document.documentElement as unknown as Record<string, unknown>).webkitRequestFullscreen;
    }
  });

  it('iPhone (no element full screen): unsupported, and a request is a no-op', () => {
    expect(fullscreenSupported()).toBe(false);
    expect(() => requestFullscreen()).not.toThrow();
    expect(fullscreenElement()).toBeNull();
  });

  it('a denied request is caught: no unhandled rejection, still windowed', async () => {
    fake = installFakeFullscreen({ deny: true });
    requestFullscreen();
    await Promise.resolve();
    expect(fake.request).toHaveBeenCalledTimes(1);
    expect(fullscreenElement()).toBeNull();
  });

  it('a request that throws synchronously (old WebKit) is caught too', () => {
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true, value: () => { throw new Error('not allowed'); },
    });
    try {
      expect(() => requestFullscreen()).not.toThrow();
    } finally {
      delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
    }
  });

  it('reads the carried-over click from navigator.userActivation; without the API it assumes none', () => {
    expect(hasTransientActivation()).toBe(false);
    vi.stubGlobal('navigator', { ...navigator, userActivation: { isActive: true } });
    expect(hasTransientActivation()).toBe(true);
  });
});

describe('leader home 放映 Present', () => {
  it('requests full screen inside the click that follows the link', () => {
    fake = installFakeFullscreen();
    const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
    render(<ul><LeaderPackRow pack={pack} counts={null} /></ul>);
    fireEvent.click(screen.getByTestId('lh-edit'));
    expect(fake.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('lh-present'));
    expect(fake.request).toHaveBeenCalledTimes(1);
  });
});
