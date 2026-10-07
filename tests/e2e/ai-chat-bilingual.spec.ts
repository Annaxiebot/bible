/**
 * ai-chat-bilingual.spec.ts — the personal chat's two panes · 中英双栏 (ADR-0017)
 *
 * The scholar answer is split by its section headings (## 中文 / ## English),
 * not by the retired [SPLIT] marker. A real user flow per case: the mocked
 * ai-proxy streams an answer (chunked mid-heading, as a real stream is), the
 * reader opens the English pane, and each half is in its own pane. Old
 * threads stored with [SPLIT] (IndexedDB, synced) must still render after a
 * reload; an answer without English never loses text.
 */
import { test, expect, Page } from '@playwright/test';
import { APP_HASH } from '../../components/landing/landingRoute';
import { NO_ENGLISH_SECTION_NOTE } from '../../services/bilingualAnswer';
import { openSignedInChat } from './helpers/hostedAI';

const ZH = '恩典是神白白赐下的礼物 (grace)。';
const EN = 'Grace is the free gift of God.';

const zhPane = (page: Page) => page.locator('div.overflow-y-auto.space-y-6').filter({ hasText: '中文解读 (Scholar Research)' });
const enPane = (page: Page) => page.locator('div.overflow-y-auto.space-y-6').filter({ hasText: 'English Commentary (Academic)' });

async function ask(page: Page, question: string) {
  await page.locator('textarea').fill(question);
  await page.keyboard.press('Enter');
}

/** The English pane starts hidden; the divider button centres it. */
async function showBothPanes(page: Page) {
  await page.getByTitle('Center divider').first().click();
  await expect(enPane(page)).toBeVisible();
}

test.describe('AI Chat — two panes from section headings (ADR-0017)', () => {
  test('a streamed heading-form answer: 中文 in the left pane, English in the right, no heading text', async ({ page }) => {
    await openSignedInChat(page, APP_HASH, [`## 中文\n${ZH}\n\n## Eng`, `lish\n${EN}`]);
    await ask(page, 'What is grace?');
    await showBothPanes(page);
    await expect(zhPane(page)).toContainText(ZH);
    await expect(enPane(page)).toContainText(EN);
    await expect(zhPane(page)).not.toContainText(EN);
    await expect(enPane(page)).not.toContainText(ZH);
    await expect(page.getByText('## English')).toHaveCount(0);
  });

  test('no English heading: the whole answer stays in the 中文 pane; the English pane says there is none', async ({ page }) => {
    await openSignedInChat(page, APP_HASH, [ZH]);
    await ask(page, 'What is grace?');
    await showBothPanes(page);
    await expect(zhPane(page)).toContainText(ZH);
    await expect(enPane(page)).toContainText(NO_ENGLISH_SECTION_NOTE);
  });

  test('a legacy [SPLIT] answer (stored by an old bundle) splits, and still does after a reload from IndexedDB', async ({ page }) => {
    await openSignedInChat(page, APP_HASH, [`${ZH}\n[SP`, `LIT]\n${EN}`]);
    await ask(page, 'What is grace?');
    await showBothPanes(page);
    await expect(enPane(page)).toContainText(EN);
    await page.waitForTimeout(500); // the thread save is debounced (100 ms) into IndexedDB

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('text=AI Chat');
    await showBothPanes(page);
    await expect(zhPane(page)).toContainText(ZH);
    await expect(enPane(page)).toContainText(EN);
    await expect(page.getByText(/\[SPLIT\]/)).toHaveCount(0);
  });
});
