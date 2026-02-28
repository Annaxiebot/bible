import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatWithAI } from '../kimi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_RESPONSE = {
  id: 'chatcmpl-test',
  object: 'chat.completion',
  created: 1700000000,
  model: 'moonshot-v1-128k',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'Chinese answer\n[SPLIT]\nEnglish answer' },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
};

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('kimi.chatWithAI', () => {
  beforeEach(() => {
    // Provide an API key via localStorage
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'kimi_api_key' ? 'test-kimi-key' : null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    // Stub import.meta.env so the module doesn't pick up real env vars
    vi.stubGlobal('import', { meta: { env: {} } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns bilingual response in Gemini-compatible shape', async () => {
    vi.stubGlobal('fetch', mockFetch(MOCK_RESPONSE));

    const result = await chatWithAI('Who is David?', []);

    expect(result.text).toBe('Chinese answer\n[SPLIT]\nEnglish answer');
    expect(result.candidates[0].content.parts[0].text).toBe(result.text);
  });

  it('sends conversation history in messages array', async () => {
    const fetchMock = mockFetch(MOCK_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAI('Follow-up', [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // system + 2 history + 1 current = 4 messages
    expect(body.messages).toHaveLength(4);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toBe('Hello');
    expect(body.messages[2].content).toBe('Hi there');
    expect(body.messages[3].content).toBe('Follow-up');
  });

  it('uses higher max_tokens when thinking mode is on', async () => {
    const fetchMock = mockFetch(MOCK_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAI('Deep question', [], { thinking: true });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.max_tokens).toBe(4096);
  });

  it('uses lower max_tokens in normal mode', async () => {
    const fetchMock = mockFetch(MOCK_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAI('Quick question', []);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.max_tokens).toBe(2048);
  });

  it('appends search hint to system prompt when search option is set', async () => {
    const fetchMock = mockFetch(MOCK_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAI('Find sources', [], { search: true });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].content).toContain('provide references to external sources');
  });

  it('ignores image option (Kimi does not support images)', async () => {
    const fetchMock = mockFetch(MOCK_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);

    await chatWithAI('Describe', [], { image: { data: 'base64data', mimeType: 'image/png' } });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // User message should be plain text, not multipart
    const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');
    expect(typeof userMsg.content).toBe('string');
  });

  it('retries on 429 and eventually returns response', async () => {
    const rateLimitResp = {
      ok: false, status: 429,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('rate limited'),
    };
    const successResp = {
      ok: true, status: 200,
      json: () => Promise.resolve(MOCK_RESPONSE),
      text: () => Promise.resolve(''),
    };
    // Fail twice, succeed on third
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(rateLimitResp)
      .mockResolvedValueOnce(rateLimitResp)
      .mockResolvedValueOnce(successResp));
    vi.stubGlobal('setTimeout', (fn: () => void) => { fn(); return 0; });

    const result = await chatWithAI('Retry me', []);
    expect(result.text).toBe('Chinese answer\n[SPLIT]\nEnglish answer');
  });

  it('throws immediately on non-rate-limit error', async () => {
    vi.stubGlobal('fetch', mockFetch('Server Error', 500));

    await expect(chatWithAI('Bad request', [])).rejects.toThrow('Kimi API error: 500');
  });

  it('throws when API key is missing', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('import', { meta: { env: {} } });

    await expect(chatWithAI('Test', [])).rejects.toThrow('Kimi API key not configured');
  });
});
