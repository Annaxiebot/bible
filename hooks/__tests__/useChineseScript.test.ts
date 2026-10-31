/**
 * useChineseScript — the 简/繁 control really converts (2026-10 review: the
 * toggle changed its label but the bundled, already-Simplified CUV text stayed
 * Simplified). Uses the real opencc dictionary (no Worker in jsdom).
 */
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import path from 'path';
import { useChineseScript } from '../useChineseScript';
import type { Verse } from '../../types';

// The bundled CUV Matthew 7 (Simplified) — the text the reviewer saw.
const MATT7 = JSON.parse(readFileSync(path.resolve(__dirname, '../../public/bible-data/cuv/MAT/7.json'), 'utf8'));
const bundled: Verse[] = MATT7.verses.slice(0, 3);

describe('useChineseScript', () => {
  it('bundled CUV is Simplified (why the traditional mode must convert)', () => {
    expect(bundled[0].text).toContain('你们不要论断人');
  });

  it('traditional mode converts the bundled Simplified text', async () => {
    const { result } = renderHook(() => useChineseScript(bundled, false));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.verses[0].text).toContain('你們不要論斷人');
    expect(result.current.verses[0].verse).toBe(1);
  });

  it('simplified mode converts Traditional (API-cached) text', async () => {
    const trad: Verse[] = [{ ...bundled[0], text: '「你們不要論斷人，免得你們被論斷。' }];
    const { result } = renderHook(() => useChineseScript(trad, true));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.verses[0].text).toBe('「你们不要论断人，免得你们被论断。');
  });

  it('toggling 简 → 繁 → 简 follows the latest choice', async () => {
    const { result, rerender } = renderHook(({ s }) => useChineseScript(bundled, s), { initialProps: { s: true } });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.verses[0].text).toContain('论断');
    rerender({ s: false });
    await waitFor(() => expect(result.current.verses[0].text).toContain('論斷'));
    rerender({ s: true });
    await waitFor(() => expect(result.current.verses[0].text).toContain('论断'));
  });

  it('a new chapter never shows the previous chapter\'s converted text', async () => {
    const other: Verse[] = MATT7.verses.slice(5, 6);
    const { result, rerender } = renderHook(({ v }) => useChineseScript(v, false), { initialProps: { v: bundled } });
    await waitFor(() => expect(result.current.pending).toBe(false));
    rerender({ v: other });
    expect(result.current.verses.map(v => v.verse)).toEqual([6]);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.verses.map(v => v.verse)).toEqual([6]);
  });

  it('an empty column stays empty', () => {
    const { result } = renderHook(() => useChineseScript([], false));
    expect(result.current.verses).toEqual([]);
    expect(result.current.pending).toBe(false);
  });
});
