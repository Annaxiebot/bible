/**
 * aiPromptParity.test.ts — the evals send what the proxy sends · 评测与代理同一提示词 (ADR-0014)
 *
 * The same app body goes once to the ai-proxy (whose policy builds the final
 * messages server-side) and once through finalAIBody (the local copy the eval
 * scripts use with a developer key, scripts/eval-*.mjs). The messages that
 * reach OpenRouter must be identical, so an evaluation measures what leaders
 * actually get (R14). The browser itself only ever sends to the proxy
 * (ADR-0007, 2026-10-23).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { validateRequest, upstreamBody, AIRole } from '../../supabase/functions/ai-proxy/policy';
import { parseStudyPack, buildSlides } from '../../components/studypack/packTypes';
import { buildRequestBody } from '../../components/studypack/askAIStream';
import { TEST_PACK_PATH } from '../../components/studypack/__tests__/fixtures';
import { CONTENT_LANGUAGES } from '../../components/studypack/principles';

let session: { access_token: string } | null = null;
vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session }, error: null }) } },
  authManager: { getState: () => ({ user: null, session, isAuthenticated: false, isLoading: false }) },
}));

import { sendAIRequest } from '../aiTransport';
import { finalAIBody } from '../aiFinalBody';
import { buildStudyBody } from '../studyAI';

/** The JSON body of the one fetch the browser made (to the proxy). */
async function sentBody(role: AIRole, body: string): Promise<Record<string, unknown>> {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  await sendAIRequest(role, body, new AbortController().signal);
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

const localMessages = (role: AIRole, body: string): unknown => (JSON.parse(finalAIBody(role, body)) as { messages: unknown }).messages;

async function proxiedMessages(role: AIRole, body: string): Promise<unknown> {
  session = { access_token: 'user-jwt' };
  const v = validateRequest(await sentBody(role, body));
  if ('detail' in v) throw new Error(v.detail);
  return upstreamBody(v.request).messages;
}

beforeEach(() => {
  session = null;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('finalAIBody ≡ proxy: the same final messages', () => {
  const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
  const slide = buildSlides(pack)[0];
  const history = [{ role: 'user' as const, content: '为什么提到飞鸟？' }, { role: 'assistant' as const, content: 'v.26 …' }];

  it('Ask AI, every content-language mode, with history', async () => {
    for (const mode of CONTENT_LANGUAGES) {
      const body = buildRequestBody({ ...pack, contentLanguage: mode }, slide, history, '什么是忧虑？', { model: 'm' });
      const local = localMessages('ask', body);
      expect(local).toEqual(await proxiedMessages('ask', body));
      expect((local as Array<{ role: string }>)[0].role).toBe('system');
    }
  });

  it('the personal app (study) with its own system prompt', async () => {
    const body = buildStudyBody('q', [{ role: 'user', content: 'earlier' }], 'SYS');
    expect(localMessages('study', body)).toEqual(await proxiedMessages('study', body));
  });

  it('pack / adjust / sharing, even from an old bundle that still sends a system message', async () => {
    const body = JSON.stringify({ model: 'm', stream: true, messages: [{ role: 'system', content: 'old' }, { role: 'user', content: 'draft' }] });
    for (const role of ['pack', 'adjust', 'sharing'] as const) {
      expect(localMessages(role, body)).toEqual(await proxiedMessages(role, body));
    }
  });
});
