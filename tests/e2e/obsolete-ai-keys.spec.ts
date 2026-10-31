/**
 * obsolete-ai-keys.spec.ts — a returning browser loses the removed AI keys · 清除旧 AI 密钥
 *
 * A browser that used the old multi-provider settings, or the removed
 * "Advanced" own OpenRouter key (ADR-0007, 2026-10-23: sign in to use AI),
 * still holds those keys. Opening the site removes them on start
 * (services/obsoleteStorageKeys.ts) and keeps everything else.
 */
import { test, expect } from '@playwright/test';
import { OBSOLETE_AI_STORAGE_KEYS, OWN_OPENROUTER_KEY } from '../../services/obsoleteStorageKeys';
import { STORAGE_KEYS } from '../../constants/storageKeys';

test('opening the site removes the old provider keys and the own OpenRouter key, and keeps other settings', async ({ page }) => {
  await page.goto('./');
  // Seed the state an old browser carries, then load the site again as a returning visitor would.
  await page.evaluate(([obsolete, ownKey, fontKey]) => {
    for (const k of obsolete) localStorage.setItem(k, 'old');
    localStorage.setItem(ownKey, 'sk-or-own');
    localStorage.setItem(fontKey, '22');
  }, [OBSOLETE_AI_STORAGE_KEYS, OWN_OPENROUTER_KEY, STORAGE_KEYS.FONT_SIZE] as const);
  await page.reload();

  const after = await page.evaluate(([obsolete, ownKey, fontKey]) => ({
    left: obsolete.filter(k => localStorage.getItem(k) !== null),
    own: localStorage.getItem(ownKey),
    font: localStorage.getItem(fontKey),
  }), [OBSOLETE_AI_STORAGE_KEYS, OWN_OPENROUTER_KEY, STORAGE_KEYS.FONT_SIZE] as const);
  expect(after.left).toEqual([]);
  expect(after.own).toBeNull();
  expect(after.font).toBe('22');
});
