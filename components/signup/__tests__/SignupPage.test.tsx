/**
 * SignupPage.test.tsx — the member's flow in jsdom · 报名页测试
 *
 * Pack loads through the TV seam (fetch of the public pack JSON) and shows
 * title + passage Chinese first; step 1 is the commitment (any number of
 * practices, at least one, own version), Next is gated on it; step 2 is
 * the contact form (large type, ≥48px targets); validation errors render
 * inline; a valid submit inserts the payload with the practice through the
 * (mocked) Supabase client, asks for the welcome email, and shows the
 * thank-you restating the commitment with the personal check-in link; an
 * insert error is shown, never swallowed; an unconfigured service is an
 * error; a public demo pack shows the no-sign-up line; an unclaimed LOCAL
 * pack (real fake-indexeddb) shows the sign-in block instead.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SignupPage from '../SignupPage';
import { SIGNUPS_TABLE, SIGNUP_LOCALE } from '../signupClient';
import { SEND_CHECKINS_FUNCTION } from '../signupSchema';
import { MARK_REPLACED_FN } from '../../../supabase/functions/send-checkins/replaced';
import { WELCOME_KIND } from '../welcomeEmail';
import { saveLocalPack } from '../../studypack/packSource';
import { idbService } from '../../../services/idbService';
import { checkinHash } from '../../checkin/checkinRoute';
import { CK_WELCOME_FAILED } from '../../checkin/checkinStrings';
import {
  SU_TITLE, SU_NAME, SU_EMAIL, SU_PHONE, SU_CONSENT, SU_SUBMIT, SU_ERR_NAME, SU_ERR_EMAIL_REQUIRED, SU_ERR_SUBMIT, SU_ERR_PRACTICE,
  SU_THANKS, SU_NEXT, SU_NEXT_NO_CHECKINS, SU_ERR_PACK, SU_ERR_NOT_CONFIGURED, SU_DEMO_LINE, SU_UNCLAIMED_LINE,
  SU_SIGN_IN_GOOGLE, SU_PRACTICE_TITLE, SU_NEXT_STEP, SU_REPLACED, SU_REPLACE_FAILED, commitmentLine,
} from '../signupStrings';
import { SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../../setup/setupStrings';

/** The anon insert result; reading the row back (.select → RETURNING) fails RLS, as live (anon has no SELECT policy). */
const insertResult = vi.fn();
const RLS_ERROR = { message: 'new row violates row-level security policy for table "study_signups"' };
const insertMock = vi.fn((_payload: unknown) => Object.assign(Promise.resolve().then(() => insertResult()), {
  select: () => ({ single: async () => ({ data: null, error: RLS_ERROR }) }),
}));
const fromMock = vi.fn(() => ({ insert: insertMock }));
const invokeMock = vi.fn();
const rpcMock = vi.fn();
const signInMock = vi.fn(async () => ({ error: null }));
let configured = true;
vi.mock('../../../services/supabase', () => ({
  get supabase() { return configured ? { from: fromMock, rpc: rpcMock, functions: { invoke: invokeMock } } : null; },
  isSupabaseConfigured: () => configured,
  authManager: { getUserId: () => null, signInWithGoogle: () => signInMock(), subscribe: () => () => undefined },
}));

const PACK_ID = '2026-10-02-matt6';
const LEADER_ID = 'uid-lead';
const ROWS = [
  { area: '健康 Health', practice: '睡前程序 · Wind-down' },
  { area: '工作 Work', practice: '写下忧虑 · Write it down' },
];
const PACK = {
  id: PACK_ID, title: '不要忧虑 Do Not Be Anxious — 马太福音 6:25–34', date: '2026-10-02',
  passageRef: '马太福音 6:25–34 · Matthew 6:25–34', enVersion: 'BSB', leaderId: LEADER_ID,
  sections: [{ kind: 'title', heading: '不要忧虑 Do Not Be Anxious' }, { kind: 'lifeMenu', heading: '生活应用 Life Menu', rows: ROWS }],
};
const { leaderId: _demoLeader, ...DEMO_PACK } = PACK;
const SIGNUP_ID = '7d4e8b2a-1c3f-4a5b-9e6d-0f1a2b3c4d5e';

async function renderWithPack() {
  render(<SignupPage packId={PACK_ID} />);
  await screen.findByTestId('signup-pack');
}

/** Step 1: tap the first practice and go to the contact step. */
function choosePractice(index = 0) {
  fireEvent.click(screen.getAllByTestId('su-practice')[index]);
  fireEvent.click(screen.getByTestId('su-next'));
}

function fill(values: { name?: string; email?: string; phone?: string }) {
  if (values.name !== undefined) fireEvent.change(screen.getByTestId('su-name'), { target: { value: values.name } });
  if (values.email !== undefined) fireEvent.change(screen.getByTestId('su-email'), { target: { value: values.email } });
  if (values.phone !== undefined) fireEvent.change(screen.getByTestId('su-phone'), { target: { value: values.phone } });
}

describe('SignupPage', () => {
  beforeEach(() => {
    configured = true;
    insertResult.mockReset().mockReturnValue({ data: null, error: null });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(SIGNUP_ID);
    insertMock.mockClear();
    fromMock.mockClear();
    rpcMock.mockReset().mockResolvedValue({ data: 0, error: null });
    invokeMock.mockReset().mockResolvedValue({ data: { attempted: 1, results: [{ status: 'sent' }] }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => PACK })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the pack title + passage, then the commitment step: the life-menu practices as large tappable choices', async () => {
    await renderWithPack();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(SU_TITLE);
    expect(screen.getByTestId('signup-pack')).toHaveTextContent(PACK.title);
    expect(screen.getByTestId('signup-pack')).toHaveTextContent(PACK.passageRef);
    expect(screen.getByText(SU_PRACTICE_TITLE)).toBeInTheDocument();
    const choices = screen.getAllByTestId('su-practice');
    expect(choices).toHaveLength(2);
    expect(choices[0]).toHaveTextContent(ROWS[0].area);
    expect(choices[0]).toHaveTextContent(ROWS[0].practice);
    expect(choices[0]).toHaveStyle({ fontSize: `${SETUP_MIN_FONT_PX}px`, minHeight: `${SETUP_MIN_TAP_PX}px` });
    expect(screen.queryByTestId('su-name')).toBeNull();
  });

  it('Next without a practice shows the bilingual reason; taps toggle any number of practices, kept in tap order', async () => {
    await renderWithPack();
    fireEvent.click(screen.getByTestId('su-next'));
    expect(screen.getByRole('alert')).toHaveTextContent(SU_ERR_PRACTICE);
    const [health, work] = screen.getAllByTestId('su-practice');
    fireEvent.click(health);
    fireEvent.click(work);
    expect(health).toHaveAttribute('data-chosen', '1');
    expect(work).toHaveAttribute('data-chosen', '2');
    fireEvent.click(health);   // clearing the first moves the next one up
    expect(work).toHaveAttribute('data-chosen', '1');
    expect(health).toHaveAttribute('data-chosen', '');
    fireEvent.click(screen.getByTestId('su-next'));
    expect(screen.getByTestId('su-commitment')).toHaveTextContent(commitmentLine(ROWS[1].practice));
    for (const label of [SU_NAME, SU_EMAIL, SU_PHONE, SU_CONSENT]) {
      expect(label.indexOf(' ')).toBeGreaterThan(0);
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId('su-name')).toHaveStyle({ fontSize: `${SETUP_MIN_FONT_PX}px`, minHeight: `${SETUP_MIN_TAP_PX}px` });
    expect(screen.getByTestId('su-submit')).toHaveStyle({ minHeight: `${SETUP_MIN_TAP_PX}px` });
    expect(screen.getByTestId('su-consent')).toBeChecked();
  });

  it('validation errors render inline and nothing is inserted', async () => {
    await renderWithPack();
    choosePractice();
    fireEvent.click(screen.getByTestId('su-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(SU_ERR_NAME);
    fill({ name: '小明', phone: '4085551234' });   // phone alone is not enough: email is required
    fireEvent.click(screen.getByTestId('su-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(SU_ERR_EMAIL_REQUIRED);
    expect(screen.getByTestId('su-email')).toBeRequired();
    expect(screen.getByTestId('su-phone')).not.toBeRequired();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('a valid submit inserts the payload with the commitment, sends the welcome, and the thank-you restates it with the check-in link', async () => {
    await renderWithPack();
    fireEvent.click(screen.getAllByTestId('su-practice')[0]);
    fireEvent.change(screen.getByTestId('su-note'), { target: { value: '十点关机 · Phone off at ten' } });
    fireEvent.click(screen.getByTestId('su-next'));
    fill({ name: ' 小明 ', email: 'ming@example.org', phone: '408 555 1234' });
    fireEvent.click(screen.getByTestId('su-submit'));
    await screen.findByTestId('signup-thanks');
    expect(fromMock).toHaveBeenCalledWith(SIGNUPS_TABLE);
    expect(insertMock).toHaveBeenCalledWith({
      id: SIGNUP_ID, pack_id: PACK_ID, leader_id: LEADER_ID, pack_title: PACK.title, name: '小明', phone: '4085551234',
      email: 'ming@example.org', consent_checkins: true, locale: SIGNUP_LOCALE,
      practices: [ROWS[0]], practice_area: ROWS[0].area, practice_text: ROWS[0].practice, practice2_area: null,
      practice2_text: null, practice_note: '十点关机 · Phone off at ten',
    });
    expect(invokeMock).toHaveBeenCalledWith(SEND_CHECKINS_FUNCTION, { body: { kind: WELCOME_KIND, signup_id: SIGNUP_ID } });
    const thanks = screen.getByTestId('signup-thanks');
    expect(thanks).toHaveTextContent(SU_THANKS);
    // The chosen practice keeps its own text; the own version is an extra labelled line.
    expect(within(thanks).getByTestId('signup-commitment')).toHaveTextContent(commitmentLine(ROWS[0].practice));
    expect(within(thanks).getByTestId('signup-own-version')).toHaveTextContent('我的版本 · My own version：十点关机 · Phone off at ten');
    expect(thanks).toHaveTextContent(SU_NEXT);
    expect(within(thanks).getByTestId('signup-checkin-link')).toHaveAttribute('href', expect.stringContaining(checkinHash(SIGNUP_ID)));
    expect(within(thanks).queryByTestId('welcome-failed')).toBeNull();
    expect(screen.queryByTestId('signup-form')).toBeNull();
    // After the insert the server is asked to retire earlier rows of this person — with only the new id.
    expect(rpcMock).toHaveBeenCalledWith(MARK_REPLACED_FN, { p_new_id: SIGNUP_ID });
    expect(within(thanks).queryByTestId('signup-replaced')).toBeNull();   // nothing was replaced
  });

  it('signing up again (the RPC replaced an earlier row) says the earlier sign-up was updated', async () => {
    rpcMock.mockResolvedValue({ data: 1, error: null });
    await renderWithPack();
    choosePractice();
    fill({ name: 'A', email: 'a@b.co' });
    fireEvent.click(screen.getByTestId('su-submit'));
    expect(await screen.findByTestId('signup-replaced')).toHaveTextContent(SU_REPLACED);
    expect(screen.queryByTestId('replace-failed')).toBeNull();
  });

  it('a failed replace is a visible notice under the thank-you (the new row is stored; the welcome still goes)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'function not found' } });
    await renderWithPack();
    choosePractice();
    fill({ name: 'A', email: 'a@b.co' });
    fireEvent.click(screen.getByTestId('su-submit'));
    expect(await screen.findByTestId('replace-failed')).toHaveTextContent(`${SU_REPLACE_FAILED}: function not found`);
    expect(screen.getByTestId('signup-thanks')).toHaveTextContent(SU_THANKS);
    expect(screen.queryByTestId('signup-replaced')).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('with consent off the thank-you says no check-ins will come; a failed welcome is shown under it', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Function not found' } });
    await renderWithPack();
    choosePractice();
    fill({ name: 'A', email: 'a@b.co' });
    fireEvent.click(screen.getByTestId('su-consent'));
    fireEvent.click(screen.getByTestId('su-submit'));
    await screen.findByTestId('signup-thanks');
    expect(insertMock.mock.calls[0][0]).toMatchObject({ consent_checkins: false });
    expect(screen.getByTestId('signup-thanks')).toHaveTextContent(SU_NEXT_NO_CHECKINS);
    expect(screen.getByTestId('welcome-failed')).toHaveTextContent(`${CK_WELCOME_FAILED}: Function not found`);
  });

  it('email without a phone is accepted (phone stays optional) and the phone is stored as null', async () => {
    await renderWithPack();
    choosePractice();
    fill({ name: 'A', email: 'a@b.co' });
    fireEvent.click(screen.getByTestId('su-submit'));
    await screen.findByTestId('signup-thanks');
    expect(insertMock.mock.calls[0][0]).toMatchObject({ email: 'a@b.co', phone: null });
  });

  it('an insert error is surfaced with the server message; the form stays', async () => {
    insertResult.mockReturnValue({ data: null, error: { message: 'permission denied' } });
    await renderWithPack();
    choosePractice();
    fill({ name: 'A', email: 'a@b.co' });
    fireEvent.click(screen.getByTestId('su-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(`${SU_ERR_SUBMIT}: permission denied`);
    expect(screen.getByTestId('signup-form')).toBeInTheDocument();
    expect(screen.getByTestId('su-submit')).not.toBeDisabled();
  });

  it('an unconfigured service is a visible error', async () => {
    configured = false;
    await renderWithPack();
    choosePractice();
    fill({ name: 'A', email: 'a@b.co' });
    fireEvent.click(screen.getByTestId('su-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(SU_ERR_NOT_CONFIGURED);
  });

  it('a missing pack is a visible error and no form renders (nothing to sign up for)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    render(<SignupPage packId="2026-01-01-none" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(SU_ERR_PACK));
    expect(screen.queryByTestId('signup-form')).toBeNull();
  });

  it('a public demo pack (no leaderId) shows the bilingual no-sign-up line instead of the form', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => DEMO_PACK })));
    await renderWithPack();
    expect(screen.getByTestId('signup-demo')).toHaveTextContent(SU_DEMO_LINE);
    expect(screen.queryByTestId('signup-form')).toBeNull();
    expect(screen.queryByTestId('qr-unclaimed')).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('an unclaimed LOCAL pack shows "sign in to enable sign-up" with the Google button (the app sign-in flow), not the demo line', async () => {
    await idbService.clear('studypacks');
    await saveLocalPack({ ...DEMO_PACK, id: 'local-2026-10-02-jhn3' } as never);
    render(<SignupPage packId="local-2026-10-02-jhn3" />);
    const block = await screen.findByTestId('qr-unclaimed');
    expect(block).toHaveTextContent(SU_UNCLAIMED_LINE);
    expect(screen.queryByTestId('signup-demo')).toBeNull();
    expect(screen.queryByTestId('signup-form')).toBeNull();
    fireEvent.click(within(block).getByRole('button', { name: SU_SIGN_IN_GOOGLE }));
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    expect(SU_UNCLAIMED_LINE).toMatch(/^[一-鿿]/);
  });
});
