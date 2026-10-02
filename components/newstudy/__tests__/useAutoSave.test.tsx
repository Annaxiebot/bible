/**
 * useAutoSave.test.tsx — a pack is never lost · 自动保存测试
 *
 * Mocked save (fake timers): the first pack is saved at once; rapid edits
 * collapse into one save after the quiet period; flush saves now; a pack
 * marked clean is not re-saved; a failed save is surfaced and keeps the
 * edit pending; unmounting with a pending edit still saves it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave, AUTOSAVE_DELAY_MS } from '../useAutoSave';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import type { StudyPack } from '../../studypack/packTypes';

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED));
const edited = (title: string): StudyPack => ({ ...pack, title });

describe('useAutoSave', () => {
  const save = vi.fn<(p: StudyPack) => Promise<void>>();
  beforeEach(() => { vi.useFakeTimers(); save.mockReset().mockResolvedValue(undefined); });
  afterEach(() => { vi.useRealTimers(); });

  it('saves a newly seen pack at once (generation just finished)', async () => {
    const { result } = renderHook(({ p }) => useAutoSave(p, save), { initialProps: { p: pack as StudyPack | null } });
    await act(async () => { await Promise.resolve(); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(pack);
    expect(result.current.status).toBe('saved');
  });

  it('debounces edits: three quick edits → one save with the last pack after the quiet period', async () => {
    const { result, rerender } = renderHook(({ p }) => useAutoSave(p, save), { initialProps: { p: pack as StudyPack | null } });
    await act(async () => { await Promise.resolve(); });
    rerender({ p: edited('one') });
    rerender({ p: edited('two') });
    rerender({ p: edited('three') });
    expect(result.current.status).toBe('dirty');
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1); });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].title).toBe('three');
    expect(result.current.status).toBe('saved');
  });

  it('flush saves a pending edit now; a clean pack is a no-op', async () => {
    const { result, rerender } = renderHook(({ p }) => useAutoSave(p, save), { initialProps: { p: pack as StudyPack | null } });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.flush(); });
    expect(save).toHaveBeenCalledTimes(1);
    rerender({ p: edited('pending') });
    await act(async () => { await result.current.flush(); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].title).toBe('pending');
  });

  it('markClean: a pack opened from the list is not re-saved', async () => {
    const { result, rerender } = renderHook(({ p }) => useAutoSave(p, save), { initialProps: { p: null as StudyPack | null } });
    act(() => result.current.markClean(pack));
    rerender({ p: pack });
    await act(async () => { await Promise.resolve(); });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe('clean');
  });

  it('a failed save is surfaced as error and rethrown by flush', async () => {
    save.mockRejectedValueOnce(new Error('quota'));
    const { result } = renderHook(({ p }) => useAutoSave(p, save), { initialProps: { p: pack as StudyPack | null } });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('quota');
    save.mockRejectedValueOnce(new Error('again'));
    await expect(act(() => result.current.flush())).rejects.toThrow('again');
  });

  it('unmounting with an edit still in the quiet period saves it', async () => {
    const { rerender, unmount } = renderHook(({ p }) => useAutoSave(p, save), { initialProps: { p: pack as StudyPack | null } });
    await act(async () => { await Promise.resolve(); });
    rerender({ p: edited('last words') });
    unmount();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].title).toBe('last words');
  });
});
