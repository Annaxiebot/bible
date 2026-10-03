/**
 * useFeedbackForm.test.tsx — Google Forms only on explicit opt-in · 连接表单接线测试
 *
 * googleForms and the session are mocked. By default nothing is created and
 * no notice shows, even for a signed-in leader with a provider_token (the
 * built-in check-in page is the default). Connect with a token creates the
 * form and applies the URL; Connect without a token remembers the pack and
 * starts the Forms-scope sign-in; on return the remembered pack gets its
 * form; every typed failure becomes the bilingual notice keeping the
 * built-in page and nothing throws; a pasted URL creates nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFeedbackForm, failureNotice, formSourceOf, FORMS_CONNECT_KEY, rememberConnect, takeConnect } from '../useFeedbackForm';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import {
  NS_FORM_CREATED, NS_FORM_CONNECTING, NS_FORM_NO_TOKEN, NS_FORM_API_DISABLED, NS_FORM_FAILED, NS_FORM_KEEP_BUILTIN,
} from '../newStudyStrings';
import type { StudyPack } from '../../studypack/packTypes';

let uid: string | null = 'uid-lead';
let token: string | null = 'tok';
let configured = true;
const signInMock = vi.fn();
vi.mock('../../../services/supabase', () => ({
  authManager: {
    getUserId: () => uid,
    getState: () => ({ session: token ? { provider_token: token } : null }),
    signInWithGoogle: (...args: unknown[]) => signInMock(...args),
  },
  isSupabaseConfigured: () => configured,
}));
const createMock = vi.fn();
vi.mock('../../../services/googleForms', () => ({
  createFeedbackForm: (...args: unknown[]) => createMock(...args),
}));

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));
const FORM = 'https://docs.google.com/forms/d/e/x/viewform';

/** The setup's sessionStorage is a vi.fn mock; give it a real backing map per test. */
function backSessionStorage(): Map<string, string> {
  const map = new Map<string, string>();
  const s = window.sessionStorage as unknown as Record<'getItem' | 'setItem' | 'removeItem', ReturnType<typeof vi.fn>>;
  s.getItem.mockReset().mockImplementation((k: string) => map.get(k) ?? null);
  s.setItem.mockReset().mockImplementation((k: string, v: string) => { map.set(k, v); });
  s.removeItem.mockReset().mockImplementation((k: string) => { map.delete(k); });
  return map;
}

const settle = () => act(async () => { await Promise.resolve(); });

describe('useFeedbackForm: nothing by default', () => {
  beforeEach(() => { uid = 'uid-lead'; token = 'tok'; configured = true; createMock.mockReset(); signInMock.mockReset(); backSessionStorage(); });

  it('a signed-in leader with a token still gets no form and no notice until Connect; Save-less edits create nothing', async () => {
    const apply = vi.fn();
    const { result, rerender } = renderHook(({ p }) => useFeedbackForm(p, apply), { initialProps: { p: pack as StudyPack | null } });
    rerender({ p: { ...pack, title: 'edited' } });
    await settle();
    expect(createMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(result.current.notice).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(typeof result.current.connect).toBe('function');
  });

  it('connect is null when Supabase is not configured (nothing to sign in to)', () => {
    configured = false;
    const { result } = renderHook(() => useFeedbackForm(pack, vi.fn()));
    expect(result.current.connect).toBeNull();
  });
});

describe('useFeedbackForm: Connect', () => {
  beforeEach(() => { uid = 'uid-lead'; token = 'tok'; configured = true; createMock.mockReset(); signInMock.mockReset(); backSessionStorage(); });

  it('with a token: creates the form for this pack and applies the URL once; a pack with a URL ignores Connect', async () => {
    createMock.mockResolvedValue({ ok: true, formId: 'f', responderUri: FORM });
    const apply = vi.fn();
    const { result, rerender } = renderHook(({ p }) => useFeedbackForm(p, apply), { initialProps: { p: pack as StudyPack | null } });
    act(() => result.current.connect!());
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith(formSourceOf(pack), 'tok');
    expect(formSourceOf(pack).practices).toHaveLength(7);
    expect(apply.mock.calls[0][0]).toEqual({ ...pack, feedbackFormUrl: FORM });
    expect(result.current.notice).toEqual({ ok: true, text: NS_FORM_CREATED, link: FORM });
    expect(signInMock).not.toHaveBeenCalled();
    rerender({ p: { ...pack, feedbackFormUrl: FORM } });
    act(() => result.current.connect!());
    await settle();
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('without a token: remembers the pack id and starts the Forms-scope sign-in; a sign-in error is a notice', async () => {
    token = null;
    signInMock.mockResolvedValueOnce({ error: null });
    const map = backSessionStorage();
    const { result } = renderHook(() => useFeedbackForm(pack, vi.fn()));
    act(() => result.current.connect!());
    await waitFor(() => expect(signInMock).toHaveBeenCalledWith({ withForms: true }));
    expect(map.get(FORMS_CONNECT_KEY)).toBe(pack.id);
    expect(result.current.notice).toEqual({ ok: true, text: NS_FORM_CONNECTING });
    expect(result.current.busy).toBe(true);   // the browser is leaving for Google
    expect(createMock).not.toHaveBeenCalled();

    map.delete(FORMS_CONNECT_KEY);   // a fresh editor (the first one left for Google)
    signInMock.mockResolvedValueOnce({ error: new Error('popup blocked') });
    const second = renderHook(() => useFeedbackForm(pack, vi.fn()));
    act(() => second.result.current.connect!());
    await waitFor(() => expect(second.result.current.notice?.ok).toBe(false));
    expect(second.result.current.notice!.text).toBe(`${NS_FORM_FAILED}: popup blocked; ${NS_FORM_KEEP_BUILTIN}`);
    expect(second.result.current.busy).toBe(false);
    expect(map.has(FORMS_CONNECT_KEY)).toBe(false);
  });

  it('back from the sign-in: the remembered pack gets its form on open (consumed once); another pack does not', async () => {
    createMock.mockResolvedValue({ ok: true, formId: 'f', responderUri: FORM });
    rememberConnect(pack.id);
    const apply = vi.fn();
    renderHook(() => useFeedbackForm({ ...pack, id: 'local-other' }, apply));
    await settle();
    expect(createMock).not.toHaveBeenCalled();
    const { result, rerender } = renderHook(({ p }) => useFeedbackForm(p, apply), { initialProps: { p: pack as StudyPack | null } });
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(result.current.notice).toEqual({ ok: true, text: NS_FORM_CREATED, link: FORM });
    expect(takeConnect(pack.id)).toBe(false);
    rerender({ p: { ...pack, title: 'edited' } });
    await settle();
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('back from the sign-in with no token (access denied): the no-token notice, the pack untouched', async () => {
    token = null;
    createMock.mockResolvedValue({ ok: false, failure: { kind: 'no-token' } });
    rememberConnect(pack.id);
    const apply = vi.fn();
    const { result } = renderHook(() => useFeedbackForm(pack, apply));
    await waitFor(() => expect(result.current.notice?.ok).toBe(false));
    expect(createMock).toHaveBeenCalledWith(formSourceOf(pack), null);
    expect(result.current.notice!.text).toBe(`${NS_FORM_NO_TOKEN}; ${NS_FORM_KEEP_BUILTIN}`);
    expect(apply).not.toHaveBeenCalled();
  });

  it('a typed failure keeps the built-in page with the cause named; Connect again retries', async () => {
    createMock.mockResolvedValueOnce({ ok: false, failure: { kind: 'api-disabled' } });
    const apply = vi.fn();
    const { result } = renderHook(() => useFeedbackForm(pack, apply));
    act(() => result.current.connect!());
    await waitFor(() => expect(result.current.notice?.ok).toBe(false));
    expect(result.current.notice!.text).toBe(`${NS_FORM_API_DISABLED}; ${NS_FORM_KEEP_BUILTIN}`);
    expect(apply).not.toHaveBeenCalled();
    createMock.mockResolvedValueOnce({ ok: true, formId: 'f', responderUri: FORM });
    act(() => result.current.connect!());
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(result.current.notice).toEqual({ ok: true, text: NS_FORM_CREATED, link: FORM });
  });

  it('a thrown fetch error becomes the failure notice (never stuck on creating)', async () => {
    createMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    const apply = vi.fn();
    const { result } = renderHook(() => useFeedbackForm(pack, apply));
    act(() => result.current.connect!());
    await waitFor(() => expect(result.current.notice?.ok).toBe(false));
    expect(result.current.notice!.text).toBe(`${NS_FORM_FAILED}: Failed to fetch; ${NS_FORM_KEEP_BUILTIN}`);
    expect(result.current.busy).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it('notice wording for each failure kind', () => {
    expect(failureNotice({ kind: 'no-token' }).text).toContain(NS_FORM_NO_TOKEN);
    expect(failureNotice({ kind: 'no-permission' }).text).toContain(NS_FORM_NO_TOKEN);
    expect(failureNotice({ kind: 'api', message: 'boom' }).text).toContain(`${NS_FORM_FAILED}: boom`);
    expect(failureNotice({ kind: 'api', message: 'boom' }).ok).toBe(false);
  });
});
