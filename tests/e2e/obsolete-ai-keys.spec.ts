/**
 * obsolete-ai-keys.spec.ts — a returning browser loses the removed AI stack's keys · 清除旧 AI 密钥
 *
 * A browser that used the old multi-provider settings still holds provider
 * API keys and toggles. Opening the site removes them on start
 * (services/obsoleteStorageKeys.ts) and keeps the user's own OpenRouter key.
 */
import { test, expect } from '@playwright/test';
import { OBSOLETE_AI_STORAGE_KEYS } from '../../services/obsoleteStorageKeys';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { E2E_API_KEY } from './helpers/tv';

test('opening the site removes the old provider keys and keeps the own OpenRouter key', async ({ page }) => {
  await page.goto('./');
  // Seed the state an old browser carries, then load the site again as a returning visitor would.
  await page.evaluate(([obsolete, ownKey, ownValue]) => {
    for (const k of obsolete) localStorage.setItem(k, 'old');
    localStorage.setItem(ownKey, ownValue);
  }, [OBSOLETE_AI_STORAGE_KEYS, STORAGE_KEYS.OPENROUTER_API_KEY, E2E_API_KEY] as const);
  await page.reload();

  const after = await page.evaluate(([obsolete, ownKey]) => ({
    left: obsolete.filter(k => localStorage.getItem(k) !== null),
    own: localStorage.getItem(ownKey),
  }), [OBSOLETE_AI_STORAGE_KEYS, STORAGE_KEYS.OPENROUTER_API_KEY] as const);
  expect(after.left).toEqual([]);
  expect(after.own).toBe(E2E_API_KEY);
});
