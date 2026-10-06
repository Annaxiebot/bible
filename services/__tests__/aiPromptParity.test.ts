/**
 * aiPromptParity.test.ts — own key and hosted send the same prompt · 两条路径同一提示词 (ADR-0014)
 *
 * The same app body goes once with an own OpenRouter key (aiTransport turns
 * it into the final messages locally) and once to the ai-proxy (whose
 * policy builds them server-side). The messages that reach OpenRouter must
 * be identical, so Ask AI and the other roles behave the same whichever
 * path a leader is on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { STORAGE_KEYS } from '../../constants/storageKeys';
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
import { buildStudyBody } from '../studyAI';

const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;

/** The JSON body of the one fetch made. */
async function sentBody(role: AIRole, body: string): Promise<Record<string, unknown>> {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  await sendAIRequest(role, body, new AbortController().signal, 'T');
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

async function ownKeyMessages(role: AIRole, body: string): Promise<unknown> {
  getItemMock.mockImplementation((k: string) => (k === STORAGE_KEYS.OPENROUTER_API_KEY ? 'sk-or-own' : null));
  session = null;
  return (await sentBody(role, body)).messages;
}

async function proxiedMessages(role: AIRole, body: string): Promise<unknown> {
  getItemMock.mockReset().mockReturnValue(null);
  session = { access_token: 'user-jwt' };
  const v = validateRequest(await sentBody(role, body));
  if ('detail' in v) throw new Error(v.detail);
  return upstreamBody(v.request).messages;
}

beforeEach(() => {
  session = null;
  getItemMock.mockReset().mockReturnValue(null);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('own key ≡ proxy: the same final messages', () => {
  const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
  const slide = buildSlides(pack)[0];
  const history = [{ role: 'user' as const, content: '为什么提到飞鸟？' }, { role: 'assistant' as const, content: 'v.26 …' }];

  it('Ask AI, every content-language mode, with history', async () => {
    for (const mode of CONTENT_LANGUAGES) {
      const body = buildRequestBody({ ...pack, contentLanguage: mode }, slide, history, '什么是忧虑？', { model: 'm' });
      const own = await ownKeyMessages('ask', body);
      expect(own).toEqual(await proxiedMessages('ask', body));
      expect((own as Array<{ role: string }>)[0].role).toBe('system');
    }
  });

  it('the personal app (study) with its own system prompt', async () => {
    const body = buildStudyBody('q', [{ role: 'user', content: 'earlier' }], 'SYS');
    expect(await ownKeyMessages('study', body)).toEqual(await proxiedMessages('study', body));
  });

  it('pack / adjust / sharing, even from an old bundle that still sends a system message', async () => {
    const body = JSON.stringify({ model: 'm', stream: true, messages: [{ role: 'system', content: 'old' }, { role: 'user', content: 'draft' }] });
    for (const role of ['pack', 'adjust', 'sharing'] as const) {
      expect(await ownKeyMessages(role, body)).toEqual(await proxiedMessages(role, body));
    }
  });
});
