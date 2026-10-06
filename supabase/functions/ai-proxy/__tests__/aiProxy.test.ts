/**
 * aiProxy.test.ts — the pure parts of ai-proxy · 本站AI代理单元测试
 *
 * Role → model, the per-role allowlist, max_tokens clamps, request
 * validation (typed 400), monthly limits from secrets, the quota result,
 * the pre-auth gate (kill switch / missing key), upstream-failure mapping,
 * the CORS origin check and the content-free log line. The copied model ids
 * and PACK_MAX_TOKENS are pinned equal to the app's single sources.
 */
import { describe, it, expect } from 'vitest';
import {
  AI_ROLES, ROLE_DEFAULT_MODEL, ROLE_ALLOWED_MODELS, ROLE_MAX_TOKENS, ASK_AI_FALLBACK_MODELS, ASK_AI_MODEL,
  PACK_GENERATION_MODEL, MAX_MESSAGES, MAX_TOTAL_CHARS, DEFAULT_MONTHLY_LIMITS, MONTHLY_LIMIT_SECRET,
  chooseModel, clampMaxTokens, validateRequest, upstreamBody, monthlyLimit, ProxyRequest,
} from '../policy.ts';
import {
  isAllowedOrigin, corsHeaders, preAuthGate, quotaFailure, upstreamFailure, logLine, SITE_ORIGIN,
} from '../responses.ts';
import * as appDefaults from '../../../../services/aiDefaults';
import { PACK_MAX_TOKENS } from '../../../../components/newstudy/packPrompt';

const USER = { role: 'user', content: '问题 question' };
const envOf = (vars: Record<string, string>) => (name: string) => vars[name] ?? '';

function valid(body: unknown): ProxyRequest {
  const v = validateRequest(body);
  if (!v.ok) throw new Error(v.detail);
  return v.request;
}

describe('pins against the app (the function imports nothing from the bundle)', () => {
  it('the model ids equal services/aiDefaults', () => {
    expect(ASK_AI_MODEL).toBe(appDefaults.ASK_AI_MODEL);
    expect(PACK_GENERATION_MODEL).toBe(appDefaults.PACK_GENERATION_MODEL);
    expect([...ASK_AI_FALLBACK_MODELS]).toEqual([...appDefaults.ASK_AI_FALLBACK_MODELS]);
  });

  it('the pack cap equals PACK_MAX_TOKENS (12000)', () => {
    expect(ROLE_MAX_TOKENS.pack).toBe(PACK_MAX_TOKENS);
    expect(ROLE_MAX_TOKENS.pack).toBe(12000);
  });
});

describe('chooseModel', () => {
  it('each role defaults: ask/study → gemini flash, pack/adjust/sharing → sonnet', () => {
    expect(ROLE_DEFAULT_MODEL).toEqual({
      ask: 'google/gemini-2.5-flash', pack: 'anthropic/claude-sonnet-4.5',
      adjust: 'anthropic/claude-sonnet-4.5', sharing: 'anthropic/claude-sonnet-4.5',
      study: 'google/gemini-2.5-flash',
    });
    for (const role of AI_ROLES) expect(chooseModel(role, undefined)).toBe(ROLE_DEFAULT_MODEL[role]);
  });

  it('honours an allowlisted request (the Ask-AI fallback chain) and nothing else', () => {
    for (const id of ASK_AI_FALLBACK_MODELS) expect(chooseModel('ask', id)).toBe(id);
    expect(chooseModel('ask', 'openai/gpt-5-pro')).toBe(ASK_AI_MODEL);
    expect(chooseModel('pack', 'google/gemini-2.5-flash-lite')).toBe(PACK_GENERATION_MODEL);   // per role
    expect(chooseModel('ask', 42)).toBe(ASK_AI_MODEL);
  });

  it('study (the personal app) shares the Ask-AI allowlist — the same list, not a copy (R3)', () => {
    expect(ROLE_ALLOWED_MODELS.study).toBe(ROLE_ALLOWED_MODELS.ask);
    for (const id of ASK_AI_FALLBACK_MODELS) expect(chooseModel('study', id)).toBe(id);
    expect(chooseModel('study', 'anthropic/claude-sonnet-4.5')).toBe(ASK_AI_MODEL);
    expect(chooseModel('study', undefined)).toBe(ASK_AI_MODEL);
  });

  it('every role default is on its own allowlist', () => {
    for (const role of AI_ROLES) expect(ROLE_ALLOWED_MODELS[role]).toContain(ROLE_DEFAULT_MODEL[role]);
  });
});

describe('clampMaxTokens', () => {
  it('caps: ask 2000, pack 12000, adjust 4000, sharing 3000, study 4000', () => {
    expect(ROLE_MAX_TOKENS).toEqual({ ask: 2000, pack: 12000, adjust: 4000, sharing: 3000, study: 4000 });
    expect(clampMaxTokens('study', 99_999)).toBe(4000);
    expect(clampMaxTokens('ask', 300)).toBe(300);
    expect(clampMaxTokens('ask', 99_999)).toBe(2000);
    expect(clampMaxTokens('pack', 50_000)).toBe(12000);
  });

  it('missing, zero, negative or non-numeric → the cap; fractions floor', () => {
    expect(clampMaxTokens('adjust', undefined)).toBe(4000);
    expect(clampMaxTokens('adjust', 0)).toBe(4000);
    expect(clampMaxTokens('sharing', -5)).toBe(3000);
    expect(clampMaxTokens('sharing', '100')).toBe(3000);
    expect(clampMaxTokens('ask', 120.9)).toBe(120);
  });
});

describe('validateRequest', () => {
  it('a good body → the forwarded request with server-chosen model and cap', () => {
    const req = valid({ role: 'ask', messages: [USER], stream: true, max_tokens: 300, temperature: 0.7, model: 'evil/model' });
    expect(req).toEqual({ role: 'ask', messages: [USER], stream: true, maxTokens: 300, model: ASK_AI_MODEL, temperature: 0.7 });
  });

  it('role study (the personal app) is accepted: Ask-AI model, capped at 4000', () => {
    const req = valid({ role: 'study', messages: [{ role: 'system', content: 's' }, USER], stream: true, max_tokens: 50_000, model: 'openai/gpt-5-pro' });
    expect(req).toMatchObject({ role: 'study', stream: true, maxTokens: 4000, model: ASK_AI_MODEL });
  });

  it('rejects with a typed invalid-request: unknown role, empty / too many / too long messages, bad shapes', () => {
    const tooMany = Array.from({ length: MAX_MESSAGES + 1 }, () => USER);
    const tooLong = [{ role: 'user', content: 'x'.repeat(MAX_TOTAL_CHARS + 1) }];
    for (const body of [
      null, 'text', { role: 'chat', messages: [USER] }, { role: 'ask' }, { role: 'ask', messages: [] },
      { role: 'ask', messages: tooMany }, { role: 'ask', messages: tooLong },
      { role: 'ask', messages: [{ role: 'tool', content: 'x' }] },
      { role: 'ask', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] },
    ]) {
      const v = validateRequest(body);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.error).toBe('invalid-request');
    }
  });

  it('exactly MAX_MESSAGES messages totalling MAX_TOTAL_CHARS pass', () => {
    const each = MAX_TOTAL_CHARS / MAX_MESSAGES;
    const messages = Array.from({ length: MAX_MESSAGES }, () => ({ role: 'user', content: 'x'.repeat(each) }));
    expect(validateRequest({ role: 'pack', messages }).ok).toBe(true);
  });

  it('drops extra message fields, an out-of-range temperature and a non-boolean reasoning switch', () => {
    const req = valid({
      role: 'ask', messages: [{ ...USER, name: 'x', extra: 1 }], temperature: 9, reasoning: { enabled: 'no', effort: 'high' },
    });
    expect(req.messages).toEqual([USER]);
    expect(req).not.toHaveProperty('temperature');
    expect(req).not.toHaveProperty('reasoning');
    expect(req.stream).toBe(false);
  });

  it('keeps the Ask-AI retry\'s reasoning-off switch and forwards it upstream', () => {
    const req = valid({ role: 'ask', messages: [USER], reasoning: { enabled: false, exclude: true } });
    expect(upstreamBody(req)).toEqual({
      model: ASK_AI_MODEL, messages: [USER], stream: false, max_tokens: 2000, reasoning: { enabled: false, exclude: true },
    });
  });
});

describe('monthlyLimit', () => {
  it('defaults: ask 300, pack 10, adjust 100, sharing 10', () => {
    expect(DEFAULT_MONTHLY_LIMITS).toEqual({ ask: 300, pack: 10, adjust: 100, sharing: 10, study: 100 });
    for (const role of AI_ROLES) expect(monthlyLimit(role, envOf({}))).toBe(DEFAULT_MONTHLY_LIMITS[role]);
  });

  it('a non-negative integer secret overrides; junk falls back to the default', () => {
    expect(MONTHLY_LIMIT_SECRET.pack).toBe('AI_MONTHLY_PACK');
    expect(MONTHLY_LIMIT_SECRET.study).toBe('AI_MONTHLY_STUDY');
    expect(monthlyLimit('study', envOf({ AI_MONTHLY_STUDY: '250' }))).toBe(250);
    expect(monthlyLimit('pack', envOf({ AI_MONTHLY_PACK: ' 25 ' }))).toBe(25);
    expect(monthlyLimit('ask', envOf({ AI_MONTHLY_ASK: '0' }))).toBe(0);
    expect(monthlyLimit('ask', envOf({ AI_MONTHLY_ASK: '-3' }))).toBe(300);
    expect(monthlyLimit('ask', envOf({ AI_MONTHLY_ASK: 'lots' }))).toBe(300);
  });
});

describe('quotaFailure', () => {
  it('-1 → 429 { error: quota, role, limit }; a count → proceed', () => {
    expect(quotaFailure(-1, 'pack', 10)).toEqual({ status: 429, body: { error: 'quota', role: 'pack', limit: 10 } });
    expect(quotaFailure(1, 'ask', 300)).toBeNull();
    expect(quotaFailure(300, 'ask', 300)).toBeNull();
  });
});

describe('preAuthGate', () => {
  it('no OPENROUTER_API_KEY → 503 not-configured', () => {
    expect(preAuthGate(envOf({}))).toEqual({ status: 503, body: { error: 'not-configured' } });
    expect(preAuthGate(envOf({ OPENROUTER_API_KEY: '  ' }))).toEqual({ status: 503, body: { error: 'not-configured' } });
  });

  it('AI_PROXY_ENABLED=0 → 503 disabled, checked first; unset or anything else is on', () => {
    expect(preAuthGate(envOf({ AI_PROXY_ENABLED: '0' }))).toEqual({ status: 503, body: { error: 'disabled' } });
    expect(preAuthGate(envOf({ AI_PROXY_ENABLED: '0', OPENROUTER_API_KEY: 'k' }))?.body).toEqual({ error: 'disabled' });
    expect(preAuthGate(envOf({ OPENROUTER_API_KEY: 'k' }))).toBeNull();
    expect(preAuthGate(envOf({ AI_PROXY_ENABLED: '1', OPENROUTER_API_KEY: 'k' }))).toBeNull();
  });
});

describe('upstreamFailure', () => {
  it('402 → 402 no-credit; 401/403 → 503 upstream-auth (never "your key is invalid")', () => {
    expect(upstreamFailure(402, { error: { message: 'Insufficient credits' } })).toEqual({ status: 402, body: { error: 'no-credit' } });
    expect(upstreamFailure(401, {})).toEqual({ status: 503, body: { error: 'upstream-auth' } });
    expect(upstreamFailure(403, null)).toEqual({ status: 503, body: { error: 'upstream-auth' } });
  });

  it('anything else passes through with OpenRouter\'s own error object', () => {
    const body = { error: { message: 'Rate limited', code: 429 } };
    expect(upstreamFailure(429, body)).toEqual({ status: 429, body });
    expect(upstreamFailure(502, null)).toEqual({ status: 502, body: { error: { message: 'OpenRouter HTTP 502', code: 502 } } });
  });
});

describe('CORS', () => {
  it('allows scripturetolife.org and http://localhost on any port, nothing else', () => {
    expect(isAllowedOrigin(SITE_ORIGIN)).toBe(true);
    expect(SITE_ORIGIN).toBe('https://scripturetolife.org');
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://localhost')).toBe(true);
    for (const bad of [null, 'https://evil.example', 'https://scripturetolife.org.evil.example', 'http://scripturetolife.org',
      'https://localhost:3000', 'http://localhost.evil.example', 'http://localhost:3000/path']) {
      expect(isAllowedOrigin(bad)).toBe(false);
    }
  });

  it('echoes an allowed origin only; always varies on Origin and allows the supabase-js headers', () => {
    expect(corsHeaders('http://localhost:5173')['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(corsHeaders('https://evil.example')).not.toHaveProperty('Access-Control-Allow-Origin');
    const h = corsHeaders(SITE_ORIGIN);
    expect(h.Vary).toBe('Origin');
    expect(h['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    for (const name of ['authorization', 'apikey', 'content-type', 'x-client-info']) {
      expect(h['Access-Control-Allow-Headers']).toContain(name);
    }
  });
});

describe('logLine', () => {
  it('carries role, an 8-char uid prefix and the status — nothing else', () => {
    expect(logLine('ask', '0123456789abcdef', 200)).toBe('[ai-proxy] role=ask uid=01234567 status=200');
    expect(logLine('-', null, 401)).toBe('[ai-proxy] role=- uid=- status=401');
  });
});
