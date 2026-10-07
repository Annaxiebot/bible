/**
 * clientIp.test.ts — the caller's address, hashed · 客户端 IP 哈希测试
 *
 * One copy for feedback and signup (R3): cf-connecting-ip (set by
 * Cloudflare) is the caller, else the first x-forwarded-for hop, and only
 * a salted SHA-256 of it is ever stored.
 */
import { describe, it, expect } from 'vitest';
import { clientIp, hashClientIp } from '../clientIp.ts';

describe('clientIp / hashClientIp', () => {
  it('cf-connecting-ip first, else the first x-forwarded-for hop, else unknown; x-real-ip is ignored', () => {
    const h = (map: Record<string, string>) => (name: string) => map[name] ?? null;
    expect(clientIp(h({ 'cf-connecting-ip': '172.6.86.79', 'x-forwarded-for': '1.2.3.4, 3.2.54.142' }))).toBe('172.6.86.79');
    expect(clientIp(h({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    expect(clientIp(h({ 'x-real-ip': '8.8.8.8' }))).toBe('unknown');
    expect(clientIp(h({}))).toBe('unknown');
  });

  it('is a 64-hex SHA-256 that depends on the salt', async () => {
    const a = await hashClientIp('s1', '1.2.3.4');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashClientIp('s2', '1.2.3.4')).not.toBe(a);
  });
});
