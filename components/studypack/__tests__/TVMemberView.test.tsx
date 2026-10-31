/**
 * TVMemberView.test.tsx — the member's phone view of a shared pack
 * (ADR-0026, R6 user flow): open "#/view/<token>" signed out → the full
 * deck renders from the RPC, with NO Ask AI anywhere; a revoked token shows
 * the bilingual "link no longer active" line, never a crash.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { TEST_PACK_PATH } from './fixtures';
import { preloadMarkdown } from '../../LazyMarkdown';
import { ASK_AI_LABEL } from '../tvHints';
import { NS_SHARE_GONE } from '../../newstudy/newStudyStrings';

await preloadMarkdown();

const rpcMock = vi.fn();
vi.mock('../../../services/supabase', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../services/supabase')>();
  return { ...real, supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } };
});

import TVPresentationView from '../TVPresentationView';

const TOKEN = 'AbC123_-xYz987654321uV';

describe('member view of a shared pack', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset().mockReturnValue(null);
  });

  it('loads the FULL pack by token through public_shared_pack and hides Ask AI', async () => {
    rpcMock.mockResolvedValue({ data: JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')), error: null });
    render(<TVPresentationView packId={TOKEN} shareToken={TOKEN} onExit={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('不要忧虑 Do Not Be Anxious')).toBeInTheDocument();
    });
    expect(rpcMock).toHaveBeenCalledWith('public_shared_pack', { p_token: TOKEN });
    // Read-only: no Ask AI pill for members.
    expect(screen.queryByText(ASK_AI_LABEL)).toBeNull();
  });

  it('a revoked or unknown token shows the bilingual notice', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    render(<TVPresentationView packId={TOKEN} shareToken={TOKEN} onExit={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(NS_SHARE_GONE);
    });
  });
});
