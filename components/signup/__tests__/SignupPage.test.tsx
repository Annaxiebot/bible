/**
 * SignupPage.test.tsx — the member's flow in jsdom · 报名页测试
 *
 * Pack loads through the TV seam (fetch of the public pack JSON) and shows
 * title + passage Chinese first; the form is large type with ≥48px targets;
 * validation errors render inline; a valid submit inserts the payload
 * through the (mocked) Supabase client and shows the thank-you; an insert
 * error is shown, never swallowed; an unconfigured service is an error; a
 * demo pack (no leaderId) shows the no-sign-up line and no form.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignupPage from '../SignupPage';
import { SIGNUPS_TABLE, SIGNUP_LOCALE } from '../signupClient';
import {
  SU_TITLE, SU_NAME, SU_EMAIL, SU_PHONE, SU_CONSENT, SU_SUBMIT, SU_ERR_NAME, SU_ERR_CONTACT, SU_ERR_SUBMIT,
  SU_THANKS, SU_NEXT, SU_NEXT_NO_CHECKINS, SU_ERR_PACK, SU_ERR_NOT_CONFIGURED, SU_DEMO_LINE,
} from '../signupStrings';
import { SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../../setup/QuickAISetup';

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));
let configured = true;
vi.mock('../../../services/supabase', () => ({
  get supabase() { return configured ? { from: fromMock } : null; },
}));

const PACK_ID = '2026-10-02-matt6';
const LEADER_ID = 'uid-lead';
const PACK = {
  id: PACK_ID, title: '不要忧虑 Do Not Be Anxious — 马太福音 6:25–34', date: '2026-10-02',
  passageRef: '马太福音 6:25–34 · Matthew 6:25–34', enVersion: 'BSB', leaderId: LEADER_ID,
  sections: [{ kind: 'title', heading: '不要忧虑 Do Not Be Anxious' }],
};
const { leaderId: _demoLeader, ...DEMO_PACK } = PACK;

async function renderWithPack() {
  render(<SignupPage packId={PACK_ID} />);
  await screen.findByTestId('signup-pack');
}

function fill(values: { name?: string; email?: string; phone?: string }) {
  if (values.name !== undefined) fireEvent.change(screen.getByTestId('su-name'), { target: { value: values.name } });
  if (values.email !== undefined) fireEvent.change(screen.getByTestId('su-email'), { target: { value: values.email } });
  if (values.phone !== undefined) fireEvent.change(screen.getByTestId('su-phone'), { target: { value: values.phone } });
}

describe('SignupPage', () => {
  beforeEach(() => {
    configured = true;
    insertMock.mockReset().mockResolvedValue({ error: null });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => PACK })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the pack title + passage and the Chinese-first form at senior-readable sizes', async () => {
    await renderWithPack();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(SU_TITLE);
    expect(screen.getByTestId('signup-pack')).toHaveTextContent(PACK.title);
    expect(screen.getByTestId('signup-pack')).toHaveTextContent(PACK.passageRef);
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
    fireEvent.click(screen.getByTestId('su-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(SU_ERR_NAME);
    fill({ name: '小明' });
    fireEvent.click(screen.getByTestId('su-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(SU_ERR_CONTACT);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('a valid submit inserts the payload into study_signups and shows the thank-you', async () => {
    await renderWithPack();
    fill({ name: ' 小明 ', email: 'ming@example.org', phone: '408 555 1234' });
    fireEvent.click(screen.getByTestId('su-submit'));
    await screen.findByTestId('signup-thanks');
    expect(fromMock).toHaveBeenCalledWith(SIGNUPS_TABLE);
    expect(insertMock).toHaveBeenCalledWith({
      pack_id: PACK_ID, leader_id: LEADER_ID, pack_title: PACK.title, name: '小明', phone: '4085551234',
      email: 'ming@example.org', consent_checkins: true, locale: SIGNUP_LOCALE,
    });
    expect(screen.getByTestId('signup-thanks')).toHaveTextContent(SU_THANKS);
    expect(screen.getByTestId('signup-thanks')).toHaveTextContent(SU_NEXT);
    expect(screen.queryByTestId('signup-form')).toBeNull();
  });

  it('with consent off the thank-you says no check-ins will come', async () => {
    await renderWithPack();
    fill({ name: 'A', email: 'a@b.co' });
    fireEvent.click(screen.getByTestId('su-consent'));
    fireEvent.click(screen.getByTestId('su-submit'));
    await screen.findByTestId('signup-thanks');
    expect(insertMock.mock.calls[0][0]).toMatchObject({ consent_checkins: false });
    expect(screen.getByTestId('signup-thanks')).toHaveTextContent(SU_NEXT_NO_CHECKINS);
  });

  it('an insert error is surfaced with the server message; the form stays', async () => {
    insertMock.mockResolvedValue({ error: { message: 'permission denied' } });
    await renderWithPack();
    fill({ name: 'A', email: 'a@b.co' });
    fireEvent.click(screen.getByTestId('su-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(`${SU_ERR_SUBMIT}: permission denied`);
    expect(screen.getByTestId('signup-form')).toBeInTheDocument();
    expect(screen.getByTestId('su-submit')).not.toBeDisabled();
  });

  it('an unconfigured service is a visible error', async () => {
    configured = false;
    await renderWithPack();
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

  it('a demo pack (no leaderId) shows the bilingual no-sign-up line instead of the form', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => DEMO_PACK })));
    await renderWithPack();
    expect(screen.getByTestId('signup-demo')).toHaveTextContent(SU_DEMO_LINE);
    expect(screen.queryByTestId('signup-form')).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
