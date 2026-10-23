/**
 * reader-phone-header.spec.ts — every reader-header control can be tapped on a phone · 手机阅读器顶栏
 *
 * 2026-10 owner report: at 390px the reader's top bar ran past the right edge,
 * so the English edition, annotate, search, history, font −/+ and the ⋮ menu
 * with 简/繁 could not be reached by touch. Below 640px the bar now keeps
 * chapter navigation and a ⋯ button whose panel holds the rest; from 640px up
 * the bar wraps instead of overflowing. The invariant pinned here: no visible
 * header control ends outside the viewport, at phone and tablet widths, for an
 * iPhone and a non-iPhone user agent — and each control does its job on a tap.
 * Every external API is blocked (helpers/reader).
 */
import { test, expect, Page } from '@playwright/test';
import {
  blockExternalApis, openMatthew7, zhColumn, enColumn, MATT7_1_SIMPLIFIED, MATT7_1_TRADITIONAL,
} from './helpers/reader';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
/** READER_MORE_PANEL_ID (components/reader/ReaderTools.tsx) — a React module, not imported into the test runner. */
const MORE_PANEL = 'reader-more-panel';

/** The controls of the ⋯ panel, by accessible name (zh interface). */
const PANEL_CONTROLS = ['中文版本', 'English version', '标注经文 Annotate verses', '搜索经文 Search verses', '阅读历史', '简', '繁', '缩小字体', '放大字体'];
const NAV_CONTROLS = ['上一章', '书卷', '章', '下一章'];

interface Control { name: string; left: number; right: number }

/** Every rendered button/select/input in the reader header (the ⋯ panel included), with its horizontal extent. */
async function headerControls(page: Page): Promise<{ vw: number; controls: Control[] }> {
  return page.getByTestId('reader-header').evaluate(header => {
    const controls = [...header.querySelectorAll('button, select, input')]
      .filter(el => el.getClientRects().length > 0)
      .map(el => {
        const r = el.getBoundingClientRect();
        const name = el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent ?? '').trim();
        return { name, left: r.left, right: r.right };
      });
    return { vw: window.innerWidth, controls };
  });
}

/** No control past either edge; and the list is not vacuous — it holds the names expected here. */
async function expectAllOnScreen(page: Page, expected: string[]) {
  const { vw, controls } = await headerControls(page);
  expect(controls.filter(c => c.left < 0 || c.right > vw + 0.5)).toEqual([]);
  expect(controls.map(c => c.name)).toEqual(expect.arrayContaining(expected));
}

async function openPanel(page: Page) {
  await page.getByTestId('reader-header').getByRole('button', { name: '更多选项' }).tap();
  const panel = page.getByTestId(MORE_PANEL);
  await expect(panel).toBeVisible();
  return panel;
}

test.beforeEach(async ({ context }) => { await blockExternalApis(context); });

test.describe('reader header — iPhone, 390px', () => {
  test.use({ ...PHONE, userAgent: IPHONE_UA });

  test('the bar fits in one row and every control in it and in the ⋯ panel responds to a tap', async ({ page }) => {
    await openMatthew7(page);
    await expect(zhColumn(page)).toContainText(MATT7_1_SIMPLIFIED);
    const header = page.getByTestId('reader-header');
    await expectAllOnScreen(page, [...NAV_CONTROLS, '更多选项']);
    expect((await header.boundingBox())!.height).toBeLessThan(64);

    // Chapter navigation, book and chapter pickers.
    const chapter = header.getByRole('combobox', { name: '章' });
    await header.getByRole('button', { name: '上一章' }).tap();
    await expect(chapter).toHaveValue('6');
    await header.getByRole('button', { name: '下一章' }).tap();
    await expect(chapter).toHaveValue('7');
    await header.getByRole('textbox', { name: '书卷' }).tap();
    await header.getByRole('button', { name: '约翰福音 John' }).tap();
    await expect(header.getByRole('textbox', { name: '书卷' })).toHaveValue('约翰福音 John');
    await expect(chapter).toHaveValue('1');
    await header.getByRole('textbox', { name: '书卷' }).tap();
    await header.getByRole('button', { name: '马太福音 Matthew' }).tap();
    await chapter.selectOption('7');
    await expect(zhColumn(page)).toContainText(MATT7_1_SIMPLIFIED);

    // The ⋯ panel: everything else, all on screen.
    let panel = await openPanel(page);
    await expectAllOnScreen(page, [...NAV_CONTROLS, ...PANEL_CONTROLS]);

    // Editions.
    await panel.getByRole('combobox', { name: '中文版本' }).selectOption('cuv');
    await expect(panel.getByRole('combobox', { name: '中文版本' })).toHaveValue('cuv');
    const english = panel.getByRole('combobox', { name: 'English version' });
    // KJV is not bundled → bible-api.com, blocked here: the English column (narrow on a phone) reports it.
    await english.selectOption('kjv');
    await expect(english).toHaveValue('kjv');
    await expect(page.getByTestId('reader-column-error-english')).toBeAttached();
    await english.selectOption('bsb');
    await expect(enColumn(page)).toContainText('Do not judge');

    // Font size −/+ (the panel stays open).
    await panel.getByRole('button', { name: '放大字体' }).tap();
    await expect(panel.getByTestId('reader-font-size')).toHaveText('20');
    await panel.getByRole('button', { name: '缩小字体' }).tap();
    await expect(panel.getByTestId('reader-font-size')).toHaveText('18');

    // 简/繁.
    await panel.getByRole('button', { name: '繁' }).tap();
    await expect(zhColumn(page)).toContainText(MATT7_1_TRADITIONAL);
    await panel.getByRole('button', { name: '简' }).tap();
    await expect(zhColumn(page)).toContainText(MATT7_1_SIMPLIFIED);

    // Annotate: the panel closes; reopened, the same button exits annotation.
    await panel.getByRole('button', { name: '标注经文 Annotate verses' }).tap();
    await expect(panel).toBeHidden();
    panel = await openPanel(page);
    const exit = panel.getByRole('button', { name: '退出标注 Exit annotation' });
    await expect(exit).toHaveAttribute('aria-pressed', 'true');
    await exit.tap();
    panel = await openPanel(page);
    await expect(panel.getByRole('button', { name: '标注经文 Annotate verses' })).toHaveAttribute('aria-pressed', 'false');

    // Search opens the search panel.
    await panel.getByRole('button', { name: '搜索经文 Search verses' }).tap();
    await expect(panel).toBeHidden();
    const closeSearch = page.getByRole('button', { name: '关闭搜索' });
    await expect(closeSearch).toBeVisible();
    await closeSearch.tap();
    await expect(closeSearch).toBeHidden();

    // History opens the reading-history dialog.
    panel = await openPanel(page);
    await panel.getByRole('button', { name: '阅读历史' }).tap();
    await expect(page.getByRole('heading', { name: '📚 阅读历史' })).toBeVisible();
    await page.getByRole('button', { name: '关闭', exact: true }).tap();
    await expect(page.getByRole('heading', { name: '📚 阅读历史' })).toBeHidden();
  });
});

test.describe('reader header — Android phone, 390px', () => {
  test.use({ ...PHONE, userAgent: ANDROID_UA });

  test('the bar and the ⋯ panel stay on screen and 简/繁 works from the panel', async ({ page }) => {
    await openMatthew7(page);
    await expect(zhColumn(page)).toContainText(MATT7_1_SIMPLIFIED);
    await expectAllOnScreen(page, [...NAV_CONTROLS, '更多选项']);
    const panel = await openPanel(page);
    await expectAllOnScreen(page, [...NAV_CONTROLS, ...PANEL_CONTROLS]);
    await panel.getByRole('button', { name: '繁' }).tap();
    await expect(zhColumn(page)).toContainText(MATT7_1_TRADITIONAL);
    await panel.getByRole('button', { name: '简' }).tap();
    await expect(zhColumn(page)).toContainText(MATT7_1_SIMPLIFIED);
  });
});

test.describe('reader header — tablet widths', () => {
  for (const width of [768, 1024]) {
    test(`${width}px: every control sits in the bar (wrapped, none off screen), no ⋯`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openMatthew7(page);
      await expect(zhColumn(page)).toContainText(MATT7_1_SIMPLIFIED);
      await expectAllOnScreen(page, [...NAV_CONTROLS, ...PANEL_CONTROLS]);
      await expect(page.getByTestId('reader-header').getByRole('button', { name: '更多选项' })).toBeHidden();
    });
  }
});
