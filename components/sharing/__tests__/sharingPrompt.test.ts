/**
 * sharingPrompt.test.ts — the sharing prompt's contracts and request body · 上周分享提示词测试 (ADR-0008)
 */
import { describe, it, expect } from 'vitest';
import { buildSharingPrompt, buildSharingRequestBody, sharingShape, SHARING_MAX_TOKENS, SHARING_SYSTEM_PROMPT } from '../sharingPrompt';
import { loadSharingMaterial } from '../sharingData';
import { CONTENT_LANGUAGE_CONTRACTS, SHARING_CONTENT_CONTRACT } from '../../studypack/principles';
import { ROLE_MAX_TOKENS } from '../../../supabase/functions/ai-proxy/policy';
import { LEADER, PREVIOUS, CURRENT, CLOSING_Q, IDENTIFIERS, defaultClient } from './fixtures';

async function material() {
  return loadSharingMaterial(defaultClient().client, PREVIOUS, LEADER);
}

describe('buildSharingPrompt', () => {
  it('carries the sharing contract (report only, no theology added, three claims separate) verbatim', async () => {
    const prompt = buildSharingPrompt({ current: CURRENT, material: await material() });
    expect(prompt).toContain(SHARING_CONTENT_CONTRACT);
    expect(SHARING_CONTENT_CONTRACT).toMatch(/Report only what the members said/);
    expect(SHARING_CONTENT_CONTRACT).toMatch(/do not add theological claims/);
    expect(SHARING_CONTENT_CONTRACT).toMatch(/Keep three kinds of claims/);
    expect(SHARING_CONTENT_CONTRACT).toMatch(/Chinese is shown first/);
  });

  it.each(['zh-keywords', 'bilingual', 'en-keywords'] as const)('uses the CURRENT pack\'s %s line rule and shape', async mode => {
    const prompt = buildSharingPrompt({ current: { ...CURRENT, contentLanguage: mode }, material: await material() });
    expect(prompt).toContain(CONTENT_LANGUAGE_CONTRACTS[mode].lineRule);
    expect(prompt).toContain(sharingShape(mode));
  });

  it('includes counts, the answers and last week\'s closing question — and no names, emails, phones or ids', async () => {
    const prompt = buildSharingPrompt({ current: CURRENT, material: await material() });
    expect(prompt).toContain('健康 Health: 2');
    expect(prompt).toContain(CLOSING_Q);
    expect(prompt).toContain('每天晚饭后散步');
    for (const id of IDENTIFIERS) expect(prompt).not.toContain(id);
  });
});

describe('buildSharingRequestBody', () => {
  it('streams one system + one user turn under the proxy\'s sharing cap; nothing identifying in the body', async () => {
    const body = buildSharingRequestBody({ current: CURRENT, material: await material() });
    const parsed = JSON.parse(body);
    expect(parsed).toMatchObject({ stream: true, max_tokens: ROLE_MAX_TOKENS.sharing });
    expect(SHARING_MAX_TOKENS).toBe(ROLE_MAX_TOKENS.sharing);
    expect(parsed.messages[0]).toEqual({ role: 'system', content: SHARING_SYSTEM_PROMPT });
    for (const id of IDENTIFIERS) expect(body).not.toContain(id);
  });
});
