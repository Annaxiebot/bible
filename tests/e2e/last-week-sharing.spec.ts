/**
 * last-week-sharing.spec.ts — "生成上周分享 · Prepare last week's sharing" (ADR-0008) · 上周分享端到端
 *
 * A signed-in leader (dev-only __LEADER_E2E__ seam + the fake Supabase base)
 * with two packs opens this week's pack in the editor, presses Prepare: the
 * previous pack's sign-ups and shared answers are read (PostgREST mocked),
 * the routed ai-proxy gets ONE role "sharing" request carrying no member
 * name, email, phone or id, and the section appears right after the title.
 * Preview shows it as slide 2. No live Supabase, no OpenRouter.
 */
import { test, expect, Page } from '@playwright/test';
import { newStudyHash } from '../../components/landing/landingRoute';
import { SIGNUPS_TABLE, CHECKIN_ANSWERS_TABLE } from '../../components/signup/signupSchema';
import { AI_PROXY_FUNCTION } from '../../services/aiProxyRoute';
import { SH_PREPARE, SH_DONE, SHARING_HEADING } from '../../components/sharing/sharingStrings';
import { E2E_LEADER_ID, E2E_SUPABASE_PATH, seedLocalPack, fetchSamplePack, injectSupabaseOverride } from './helpers/signup';
import { fakeLeaderSession } from './helpers/leader';
import { sseBody, OPENROUTER_CHAT_URL } from './helpers/tv';

const PREVIOUS_ID = 'local-2026-10-02-matt6';
const CURRENT_ID = 'local-2026-10-09-matt6';
const MEMBER = { name: '王小明', email: 'ming@example.org', phone: '+14085551234' };

const SIGNUP_ROWS = [
  {
    id: 'signup-1', leader_id: E2E_LEADER_ID, ...MEMBER, consent_checkins: true, created_at: '2026-10-02T20:00:00Z',
    practice_area: '健康 Health', practice_text: '散步 · Walk', practice2_area: null, practice2_text: null, practice_note: null,
  },
];
const ANSWER_ROWS = [
  { id: 'answer-1', signup_id: 'signup-1', leader_id: E2E_LEADER_ID, kind: 'tue', answer: '王小明：每天散步，焦虑少了。电话 +14085551234', created_at: '2026-10-06T00:00:00Z' },
];
/** The sample pack predates contentLanguage, so it is bilingual: every item carries both halves. */
const REPLY = JSON.stringify({
  themes: [{ zh: '散步让焦虑变少', en: 'Walking eased anxiety' }, { zh: '操练需要同伴', en: 'Practice needs company' }],
  quotes: [{ zh: '走一走，心里松了', en: 'A walk loosened my heart' }],
  question: { zh: '上周哪一刻你放下了忧虑？', en: 'When did you let worry go last week?' },
});
const QUOTE_LINE = '「走一走，心里松了 · A walk loosened my heart」';

/** Fake PostgREST: anything else under the base answers [] (sync pushes, summaries); the two reads return the rows. */
async function mockSupabase(page: Page) {
  const json = { 'Content-Type': 'application/json' };
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/**`, route => route.fulfill({ status: 200, headers: json, body: '[]' }));
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${SIGNUPS_TABLE}**`, route =>
    route.fulfill({ status: 200, headers: json, body: JSON.stringify(SIGNUP_ROWS) }));
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${CHECKIN_ANSWERS_TABLE}**`, route =>
    route.fulfill({ status: 200, headers: json, body: JSON.stringify(ANSWER_ROWS) }));
}

async function mockProxy(page: Page): Promise<() => string[]> {
  const bodies: string[] = [];
  await page.route(`**${E2E_SUPABASE_PATH}/functions/v1/${AI_PROXY_FUNCTION}`, route => {
    bodies.push(route.request().postData() ?? '');
    return route.fulfill({
      status: 200, headers: { 'Content-Type': 'text/event-stream' },
      body: sseBody([{ model: 'anthropic/claude-sonnet-4.5', choices: [{ delta: { content: REPLY }, finish_reason: 'stop' }] }]),
    });
  });
  return () => bodies;
}

test('a signed-in leader prepares last week\'s sharing: section after the title, slide 2 in Preview', async ({ page }) => {
  await injectSupabaseOverride(page);
  await fakeLeaderSession(page);
  await mockSupabase(page);
  const proxyBodies = await mockProxy(page);
  let openRouterHits = 0;
  await page.route(OPENROUTER_CHAT_URL, route => { openRouterHits++; return route.abort(); });

  const sample = await fetchSamplePack(page);
  await seedLocalPack(page, { ...sample, id: PREVIOUS_ID, date: '2026-10-02', leaderId: E2E_LEADER_ID });
  await seedLocalPack(page, { ...sample, id: CURRENT_ID, title: '本周 This week', date: '2026-10-09', leaderId: E2E_LEADER_ID });

  await page.goto(`./${newStudyHash(CURRENT_ID)}`);
  await expect(page.getByTestId('sh-previous')).toHaveValue(PREVIOUS_ID);
  await page.getByRole('button', { name: SH_PREPARE }).click();
  await expect(page.getByTestId('sh-status')).toHaveText(SH_DONE);

  const sections = page.getByTestId('ns-section');
  await expect(sections.nth(0)).toHaveAttribute('data-kind', 'title');
  await expect(sections.nth(1)).toHaveAttribute('data-kind', 'sharing');
  await expect(sections.nth(1).getByRole('textbox', { name: SHARING_HEADING })).toHaveValue(/^散步让焦虑变少 · Walking eased anxiety\n[\s\S]*「走一走，心里松了 · A walk loosened my heart」[\s\S]*When did you let worry go last week\?$/);

  const [body] = proxyBodies();
  expect(proxyBodies()).toHaveLength(1);
  expect(JSON.parse(body).role).toBe('sharing');
  for (const id of [MEMBER.name, MEMBER.email, MEMBER.phone, 'signup-1', 'answer-1']) expect(body).not.toContain(id);
  expect(openRouterHits).toBe(0);

  await page.getByTestId('ns-preview').click();
  await expect(page.getByTestId('tv-presentation')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('tv-counter')).toHaveText(/^2\//);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(SHARING_HEADING);
  await expect(page.getByText(QUOTE_LINE)).toBeVisible();
});
