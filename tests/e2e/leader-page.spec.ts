/**
 * leader-page.spec.ts — a pack's sign-up page, shared answers first · 组长名单页端到端
 *
 * Signed in through the dev-only __LEADER_E2E__ seam, the leader opens
 * #/leader/<id> for a pack they own (seeded in IndexedDB); PostgREST is
 * mocked (study_signups, checkin_answers, pack_summaries). The shared
 * answers come first in a gold-framed section with a count, newest card
 * first; the sign-up table has a shaded header, "—" for a missing phone, a
 * compact time, and a quiet Stop emails control that is still ≥ 48px tall.
 * At phone width the table turns into stacked cards with no sideways
 * overflow. No live Supabase.
 */
import { test, expect, Page } from '@playwright/test';
import { leaderHash } from '../../components/leader/leaderRoute';
import { LD_EMPTY_CELL, LD_STOP, countLine } from '../../components/leader/leaderStrings';
import { CK_KIND_LABEL } from '../../components/checkin/checkinStrings';
import { SETUP_MIN_TAP_PX } from '../../components/setup/setupStrings';
import { E2E_LEADER_ID, seedLocalPack, fetchSamplePack } from './helpers/signup';
import { fakeLeaderSession, mockLeaderList, leaderSignupRow, leaderAnswerRow } from './helpers/leader';

const PACK_ID = 'local-2026-10-09-matt6';
const PHONE_WIDTH = 390;

const SIGNUPS = [
  leaderSignupRow('s1', '王小明', { phone: '+14085551234', created_at: '2026-10-06T22:12:00Z' }),
  leaderSignupRow('s2', 'Ann Lee', { created_at: '2026-10-05T18:40:00Z' }),
  leaderSignupRow('s3', '李华', { phone: '+14155550000', consent_checkins: false, created_at: '2026-10-04T15:03:00Z' }),
];
const ANSWERS = [
  leaderAnswerRow('a1', 's1', 'tue', '这周有三个晚上按时关手机，睡得好多了。', '2026-10-07T03:10:00Z'),
  leaderAnswerRow('a2', 's2', 'thu', 'Prayed before work twice — calmer at the 9am meeting.', '2026-10-09T16:00:00Z'),
];

async function openLeaderPage(page: Page) {
  // Seams first: seeding loads the app, and the later goto only changes the hash (no new document).
  await fakeLeaderSession(page);
  await mockLeaderList(page, { signups: SIGNUPS, answers: ANSWERS });
  const sample = await fetchSamplePack(page);
  await seedLocalPack(page, { ...sample, id: PACK_ID, date: '2026-10-09', leaderId: E2E_LEADER_ID });
  await page.goto(`./${leaderHash(PACK_ID)}`);
  await expect(page.getByTestId('leader-table')).toBeVisible();
}

test.describe('Leader sign-up page', () => {
  test('shared answers first, then a clear table with a quiet ≥48px Stop control', async ({ page }) => {
    await openLeaderPage(page);
    await expect(page.getByTestId('leader-count')).toHaveText(countLine(3));
    const feedback = page.getByTestId('leader-feedback');
    await expect(page.getByTestId('leader-feedback-count')).toHaveText('2');
    const cards = feedback.getByTestId('leader-answer');
    await expect(cards).toHaveCount(2);
    await expect(cards.first().getByTestId('leader-answer-kind')).toHaveText(CK_KIND_LABEL.thu);   // newest first
    await expect(cards.first().getByTestId('leader-answer-name')).toHaveText('Ann Lee');
    const feedbackBox = (await feedback.boundingBox())!;
    expect(feedbackBox.y).toBeLessThan((await page.getByTestId('leader-table').boundingBox())!.y);

    const rows = page.getByTestId('leader-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1).getByTestId('leader-phone')).toHaveText(LD_EMPTY_CELL);
    const stop = rows.first().getByRole('button', { name: LD_STOP });
    expect((await stop.boundingBox())!.height).toBeGreaterThanOrEqual(SETUP_MIN_TAP_PX);
    const time = rows.first().getByTestId('leader-time');
    expect((await time.boundingBox())!.height).toBeLessThan(40);   // one line, never wraps
  });

  test('phone width: the table becomes stacked cards, nothing overflows sideways', async ({ page }) => {
    await page.setViewportSize({ width: PHONE_WIDTH, height: 844 });
    await openLeaderPage(page);
    const head = (await page.getByTestId('leader-table-head').boundingBox())!;
    expect(head.height).toBeLessThanOrEqual(1);   // visually hidden, still in the a11y tree
    const scroller = page.getByTestId('leader-page');
    const overflow = await scroller.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const row = (await page.getByTestId('leader-row').first().boundingBox())!;
    expect(row.width).toBeLessThanOrEqual(PHONE_WIDTH);
  });
});
