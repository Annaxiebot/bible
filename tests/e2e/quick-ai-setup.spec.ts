/**
 * quick-ai-setup.spec.ts — #/setup with a key already stored · 设置AI端到端测试
 *
 * The dialog opens in the saved state: last 4 of the key only, the three
 * "模型 Models" rows prefilled with the effective values, Test sends the
 * stored key against the Ask-AI model, a typed pack model survives a reload
 * and Recommended clears it, Replace reveals the empty masked field. Split
 * from landing.spec.ts (R4).
 */
import { test, expect } from '@playwright/test';
import { SETUP_HASH } from '../../components/landing/landingRoute';
import {
  SETUP_TITLE, SETUP_KEY_LABEL, SETUP_TEST, SETUP_TEST_OK, SETUP_TEST_NO_CREDITS,
  SETUP_REPLACE, SETUP_MODEL_ASK, SETUP_MODEL_PACK, SETUP_MODEL_FALLBACKS, recommendedFor, savedKeyLine, maskApiKey,
} from '../../components/setup/setupStrings';
import { ASK_AI_MODEL, PACK_GENERATION_MODEL, ASK_AI_FALLBACK_MODELS } from '../../services/aiDefaults';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { injectApiKey, E2E_API_KEY, mockOpenRouterSequence } from './helpers/tv';

test.describe('Quick AI setup — saved state', () => {
  test('#/setup with a stored key opens in the saved state: last 4 only, model rows, Test uses the stored key', async ({ page }) => {
    await injectApiKey(page);
    const mock = await mockOpenRouterSequence(page, [
      { json: { model: ASK_AI_MODEL, choices: [{ message: { content: 'ok' } }] } },
      { status: 402, message: 'Insufficient credits' },
    ]);
    await page.goto(`./${SETUP_HASH}`);
    const dialog = page.getByRole('dialog', { name: SETUP_TITLE });
    await expect(dialog.getByTestId('saved-key')).toHaveText(savedKeyLine(maskApiKey(E2E_API_KEY)));
    expect(await dialog.getByTestId('saved-key').textContent()).not.toContain(E2E_API_KEY);
    await expect(dialog.getByLabel(SETUP_KEY_LABEL)).toHaveCount(0);

    // The three model rows show the effective defaults; a typed pack model persists across reload; Recommended resets it
    await expect(dialog.getByRole('textbox', { name: SETUP_MODEL_ASK })).toHaveValue(ASK_AI_MODEL);
    await expect(dialog.getByRole('textbox', { name: SETUP_MODEL_PACK })).toHaveValue(PACK_GENERATION_MODEL);
    await expect(dialog.getByRole('textbox', { name: SETUP_MODEL_FALLBACKS })).toHaveValue(ASK_AI_FALLBACK_MODELS.join(', '));
    await dialog.getByRole('textbox', { name: SETUP_MODEL_PACK }).fill('deepseek/deepseek-chat-v3-0324');
    await page.reload();
    await expect(dialog.getByRole('textbox', { name: SETUP_MODEL_PACK })).toHaveValue('deepseek/deepseek-chat-v3-0324');
    await dialog.getByRole('button', { name: recommendedFor(SETUP_MODEL_PACK) }).click();
    await expect(dialog.getByRole('textbox', { name: SETUP_MODEL_PACK })).toHaveValue(PACK_GENERATION_MODEL);
    expect(await page.evaluate(k => localStorage.getItem(k), STORAGE_KEYS.AI_PACK_MODEL)).toBe(PACK_GENERATION_MODEL);

    // Test with nothing typed: the stored key goes on the wire, against the Ask-AI model
    await dialog.getByRole('button', { name: SETUP_TEST }).click();
    await expect(dialog.getByRole('status')).toHaveText(SETUP_TEST_OK);
    expect(mock.bodies()[0].model).toBe(ASK_AI_MODEL);
    // A 402 is reported as the credits outcome with the status
    await dialog.getByRole('button', { name: SETUP_TEST }).click();
    await expect(dialog.getByRole('status')).toHaveText(`${SETUP_TEST_NO_CREDITS} · HTTP 402: Insufficient credits`);

    // Replace reveals the empty masked field
    await dialog.getByRole('button', { name: SETUP_REPLACE }).click();
    const field = dialog.getByLabel(SETUP_KEY_LABEL);
    await expect(field).toHaveValue('');
    await expect(field).toHaveAttribute('type', 'password');
    expect(page.url()).not.toContain(E2E_API_KEY);
  });

});
