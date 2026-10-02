/**
 * useFeedbackForm.test.tsx — the editor's pack gets its form, or a notice · 自动建表单接线测试
 *
 * googleForms and the session are mocked. Success applies the URL to the
 * pack (once per pack id); every typed failure becomes the bilingual
 * fallback notice and nothing throws; a pasted URL or a signed-out leader
 * creates nothing; retry re-attempts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFeedbackForm, failureNotice, formSourceOf } from '../useFeedbackForm';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import {
  NS_FORM_CREATED, NS_FORM_NO_TOKEN, NS_FORM_API_DISABLED, NS_FORM_FAILED, NS_FORM_FALLBACK,
} from '../newStudyStrings';
import type { StudyPack } from '../../studypack/packTypes';

let uid: string | null = 'uid-lead';
let token: string | null = 'tok';
vi.mock('../../../services/supabase', () => ({
  authManager: { getUserId: () => uid, getState: () => ({ session: token ? { provider_token: token } : null }) },
}));
const createMock = vi.fn();
vi.mock('../../../services/googleForms', () => ({
  createFeedbackForm: (...args: unknown[]) => createMock(...args),
}));

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED));
const FORM = 'https://docs.google.com/forms/d/e/x/viewform';

describe('useFeedbackForm', () => {
  beforeEach(() => { uid = 'uid-lead'; token = 'tok'; createMock.mockReset(); });

  it('creates the form for a new pack with the session token and applies the URL once', async () => {
    createMock.mockResolvedValue({ ok: true, formId: 'f', responderUri: FORM });
    const apply = vi.fn();
    const { result, rerender } = renderHook(({ p }) => useFeedbackForm(p, apply), { initialProps: { p: pack as StudyPack | null } });
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith(formSourceOf(pack), 'tok');
    expect(formSourceOf(pack).practices).toHaveLength(7);
    expect(apply.mock.calls[0][0]).toEqual({ ...pack, feedbackFormUrl: FORM });
    expect(result.current.notice).toEqual({ ok: true, text: NS_FORM_CREATED, link: FORM });
    rerender({ p: { ...pack, feedbackFormUrl: FORM } });
    rerender({ p: { ...pack, title: 'edited' } });   // same pack id: no second attempt
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('a typed failure becomes the fallback notice naming the cause; the pack is untouched; retry tries again', async () => {
    createMock.mockResolvedValueOnce({ ok: false, failure: { kind: 'api-disabled' } });
    const apply = vi.fn();
    const { result } = renderHook(() => useFeedbackForm(pack, apply));
    await waitFor(() => expect(result.current.notice?.ok).toBe(false));
    expect(result.current.notice!.text).toBe(`${NS_FORM_API_DISABLED}; ${NS_FORM_FALLBACK}`);
    expect(apply).not.toHaveBeenCalled();
    createMock.mockResolvedValueOnce({ ok: true, formId: 'f', responderUri: FORM });
    act(() => result.current.retry());
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(result.current.notice).toEqual({ ok: true, text: NS_FORM_CREATED, link: FORM });
  });

  it('notice wording for each failure kind', () => {
    expect(failureNotice({ kind: 'no-token' }).text).toContain(NS_FORM_NO_TOKEN);
    expect(failureNotice({ kind: 'no-permission' }).text).toContain(NS_FORM_NO_TOKEN);
    expect(failureNotice({ kind: 'api', message: 'boom' }).text).toContain(`${NS_FORM_FAILED}: boom`);
    expect(failureNotice({ kind: 'api', message: 'boom' }).ok).toBe(false);
  });

  it('creates nothing for a pack that already has a form URL, or when signed out; no token → the sign-in notice', async () => {
    const apply = vi.fn();
    renderHook(() => useFeedbackForm({ ...pack, feedbackFormUrl: FORM }, apply));
    uid = null;
    renderHook(() => useFeedbackForm(pack, apply));
    await act(async () => { await Promise.resolve(); });
    expect(createMock).not.toHaveBeenCalled();
    uid = 'uid-lead'; token = null;
    createMock.mockResolvedValue({ ok: false, failure: { kind: 'no-token' } });
    const { result } = renderHook(() => useFeedbackForm(pack, apply));
    await waitFor(() => expect(result.current.notice?.ok).toBe(false));
    expect(createMock).toHaveBeenCalledWith(formSourceOf(pack), null);
    expect(result.current.notice!.text).toContain(NS_FORM_NO_TOKEN);
    expect(apply).not.toHaveBeenCalled();
  });
});
