// R5 regression: the form waits for this hook (PhaseView), so a failed suggestion must still open it.
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../nextStudy', async importOriginal => ({
  ...(await importOriginal<typeof import('../nextStudy')>()),
  suggestNextStudy: vi.fn(async () => { throw new Error('chapter file failed'); }),
}));

import { useNextStudy } from '../useNextStudy';
import { FIRST_STUDY } from '../nextStudy';

describe('useNextStudy', () => {
  it('falls back to the first study when the suggestion fails, so the form still opens', async () => {
    const { result } = renderHook(() => useNextStudy([], true));
    await waitFor(() => expect(result.current).toEqual(FIRST_STUDY));
  });

  it('stays null until the packs have loaded', () => {
    const { result } = renderHook(() => useNextStudy([], false));
    expect(result.current).toBeNull();
  });
});
