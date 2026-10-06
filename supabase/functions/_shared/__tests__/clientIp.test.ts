/**
 * clientIp.test.ts — the caller's address, hashed · 客户端 IP 哈希测试
 *
 * One copy for feedback and signup (R3): the first x-forwarded-for hop is
 * the caller, and only a salted SHA-256 of it is ever stored.
 */
import { describe, it, expect } from 'vitest';
import { clientIp, hashClientIp } from '../clientIp.ts';

describe('clientIp / hashClientIp', () => {
  it('first x-forwarded-for hop, else x-real-ip, else unknown', () => {
    const h = (map: Record<string, string>) => (name: string) => map[name] ?? null;
    expect(clientIp(h({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    expect(clientIp(h({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
    expect(clientIp(h({}))).toBe('unknown');
  });

  it('is a 64-hex SHA-256 that depends on the salt', async () => {
    const a = await hashClientIp('s1', '1.2.3.4');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashClientIp('s2', '1.2.3.4')).not.toBe(a);
  });
});
