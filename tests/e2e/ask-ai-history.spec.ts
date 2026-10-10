/**
 * ask-ai-history.spec.ts — Ask AI conversations saved per study, for the leader only · 问一问记录端到端 (ADR-0021)
 *
 * The leader is signed in through the dev-only __LEADER_E2E__ seam with no
 * key of their own (hosted AI: the routed ai-proxy answers), and owns the
 * sample pack (its JSON served with leaderId). PostgREST is the in-memory
 * fake of helpers/askHistory, whose RPC follows the SQL's 20-per-study
 * rule. Flows: ask → saved; reload → restored (and sent as history);
 * at the limit → notice → Replace oldest → saved, oldest gone, permission
 * kept; the leader page lists, opens, deletes one and deletes all.
 * No live Supabase, no live AI.
 */
import { test, expect, Page } from '@playwright/test';
import { SAMPLE_PACK_ID } from '../../components/landing/landingRoute';
import { leaderHash } from '../../components/leader/leaderRoute';
import { ASK_HISTORY_LIMIT } from '../../components/studypack/askHistoryRules';
import {
  AH_FULL_NOTICE, AH_REPLACE, AH_CLEAR, AH_DELETE, AH_DELETE_ALL, AH_NONE, AH_REPLACE_ON, AH_REPLACE_STOP, historyCountLine,
} from '../../components/studypack/askHistoryStrings';
import { E2E_LEADER_ID, routeOwnedSamplePack, seedLocalPack, fetchSamplePack } from './helpers/signup';
import { openTV, sseBody } from './helpers/tv';
import { signInAsLeader, mockProxy, ProxyCall } from './helpers/hostedAI';
import { fakeLeaderSession, mockLeaderList } from './helpers/leader';
import { mockAskHistory, seedExchanges, AskHistoryServer } from './helpers/askHistory';

const MODEL = 'google/gemini-2.5-flash';
const ANSWER = '天父知道你们需用这一切 (v.32).';

async function ownedTV(page: Page, seed = seedExchanges(SAMPLE_PACK_ID, 0)): Promise<{ server: AskHistoryServer; calls: () => ProxyCall[] }> {
  await signInAsLeader(page);
  await routeOwnedSamplePack(page);
  const calls = await mockProxy(page, { sse: sseBody([{ model: MODEL, choices: [{ delta: { content: ANSWER }, finish_reason: 'stop' }] }]) });
  const server = await mockAskHistory(page, seed);
  await openTV(page);
  return { server, calls };
}

async function ask(page: Page, question: string) {
  const input = page.getByLabel(/Ask AI question/);
  await expect(input).toBeEnabled();
  await input.fill(question);
  await input.press('Enter');
  await expect(page.getByTestId('ask-question')).toContainText(question);
  await expect(page.getByTestId('ask-latest').getByTestId('ask-answer')).toContainText(ANSWER);
}

test.describe('Ask AI history on the TV (owned study)', () => {
  test('ask → saved; reload → the exchange is back and goes with the next question', async ({ page }) => {
    const { server, calls } = await ownedTV(page);
    await page.keyboard.press('a');
    await ask(page, '为什么不要忧虑？');
    await expect.poll(() => server.rows().map(r => r.question)).toEqual(['为什么不要忧虑？']);
    expect(server.rows()[0]).toMatchObject({ pack_id: SAMPLE_PACK_ID, answer: ANSWER, model: MODEL });
    expect(server.rpcCalls()[0]).toMatchObject({ p_replace_oldest: false });

    await page.reload();
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await page.keyboard.press('a');
    await expect(page.getByTestId('ask-question')).toContainText('为什么不要忧虑？');   // restored, newest at the bottom
    await expect(page.getByTestId('ask-answer')).toContainText(ANSWER);
    await ask(page, 'Follow-up?');
    const followUp = calls()[calls().length - 1].body.messages;
    expect(followUp.slice(0, 2)).toEqual([{ role: 'user', content: '为什么不要忧虑？' }, { role: 'assistant', content: ANSWER }]);

    // Clear empties the view; nothing saved is deleted.
    await page.getByRole('button', { name: AH_CLEAR }).click();
    await expect(page.getByTestId('ask-question')).toHaveCount(0);
    expect(server.rows()).toHaveLength(2);
  });

  test(`at ${ASK_HISTORY_LIMIT}: the notice under the answer → Replace oldest saves it, drops the oldest, and the next one replaces without asking`, async ({ page }) => {
    const { server } = await ownedTV(page, seedExchanges(SAMPLE_PACK_ID, ASK_HISTORY_LIMIT));
    await page.keyboard.press('a');
    await expect(page.getByTestId('ask-question')).toContainText(`Old question ${ASK_HISTORY_LIMIT}`);
    await ask(page, '第二十一个问题');
    const notice = page.getByTestId('ask-history-full');
    await expect(notice).toHaveText(new RegExp(AH_FULL_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    expect(server.rows().some(r => r.question === '第二十一个问题')).toBe(false);   // not saved yet

    await notice.getByRole('button', { name: AH_REPLACE }).click();
    await expect(notice).toHaveCount(0);
    await expect.poll(() => server.rows().some(r => r.question === '第二十一个问题')).toBe(true);
    expect(server.rows()).toHaveLength(ASK_HISTORY_LIMIT);
    expect(server.rows().some(r => r.id === 'seed-1')).toBe(false);
    expect(server.replaceAllowed(SAMPLE_PACK_ID)).toBe(true);

    await ask(page, '第二十二个问题');
    await expect.poll(() => server.rows().some(r => r.question === '第二十二个问题')).toBe(true);
    await expect(page.getByTestId('ask-history-full')).toHaveCount(0);
    expect(server.rows()).toHaveLength(ASK_HISTORY_LIMIT);
    expect(server.rows().some(r => r.id === 'seed-2')).toBe(false);
  });
});

test.describe('Ask AI history on the leader page', () => {
  const PACK_ID = 'local-2026-10-09-matt6';

  test('lists newest first, opens an answer, deletes one, shows and stops replacing, deletes all', async ({ page }) => {
    await fakeLeaderSession(page);
    await mockLeaderList(page, { signups: [], answers: [] });
    const server = await mockAskHistory(page, seedExchanges(PACK_ID, 3), [PACK_ID]);
    const sample = await fetchSamplePack(page);
    await seedLocalPack(page, { ...sample, id: PACK_ID, date: '2026-10-09', leaderId: E2E_LEADER_ID });
    page.on('dialog', dialog => void dialog.accept());
    await page.goto(`./${leaderHash(PACK_ID)}`);

    const section = page.getByTestId('leader-ask-history');
    await expect(section.getByTestId('ask-history-count')).toHaveText(historyCountLine(3));
    const questions = section.getByTestId('ask-history-question');
    await expect(questions).toHaveText([/Old question 3/, /Old question 2/, /Old question 1/]);
    await questions.first().click();
    await expect(section.getByTestId('ask-history-answer')).toHaveText(/Old answer 3/);

    const replace = section.getByTestId('ask-history-replace');
    await expect(replace).toContainText(AH_REPLACE_ON);
    await replace.getByRole('button', { name: AH_REPLACE_STOP }).click();
    await expect(replace).toHaveCount(0);
    expect(server.replaceAllowed(PACK_ID)).toBe(false);

    await section.getByTestId('ask-history-item').first().getByRole('button', { name: AH_DELETE }).click();
    await expect(questions).toHaveCount(2);
    expect(server.rows().map(r => r.id).sort()).toEqual(['seed-1', 'seed-2']);

    await section.getByRole('button', { name: AH_DELETE_ALL }).click();
    await expect(section.getByTestId('ask-history-none')).toHaveText(AH_NONE);
    expect(server.rows()).toHaveLength(0);
  });
});
