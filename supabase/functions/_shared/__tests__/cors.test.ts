/**
 * cors.test.ts — the shared CORS policy · 跨域策略测试
 *
 * Regression: send-checkins answered the browser's preflight with 405, so the
 * member's welcome email failed with "Failed to send a request to the Edge
 * Function". Both functions now share this module.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { isAllowedOrigin, corsHeaders, preflightResponse, withCors, SITE_ORIGIN } from '../cors.ts';

describe('shared CORS policy', () => {
  it('allows the site and localhost, nothing else', () => {
    expect(isAllowedOrigin(SITE_ORIGIN)).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
  });

  it('preflight: 204 with the origin echoed for the site, 403 without it elsewhere', () => {
    const ok = preflightResponse(SITE_ORIGIN);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(SITE_ORIGIN);
    expect(ok.headers.get('Access-Control-Allow-Headers')).toContain('apikey');
    const bad = preflightResponse('https://evil.example');
    expect(bad.status).toBe(403);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('withCors adds the headers to a handler response', () => {
    const r = withCors(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }), SITE_ORIGIN);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(SITE_ORIGIN);
    expect(r.headers.get('Content-Type')).toBe('application/json');
    expect(corsHeaders(null)['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('both browser-called functions use it (send-checkins answers OPTIONS)', () => {
    const root = path.resolve(__dirname, '../..');
    const send = readFileSync(path.join(root, 'send-checkins/index.ts'), 'utf8');
    expect(send).toMatch(/from '\.\.\/_shared\/cors\.ts'/);
    expect(send).toMatch(/request\.method === 'OPTIONS'\) return preflightResponse/);
    expect(readFileSync(path.join(root, 'ai-proxy/responses.ts'), 'utf8')).toMatch(/from '\.\.\/_shared\/cors\.ts'/);
  });
});
