/**
 * signupRoute.test.ts — hash ↔ pack id and the QR URL · 报名路由测试
 */
import { describe, it, expect } from 'vitest';
import { signupHash, getSignupPackIdFromHash, signupUrl, currentSignupUrl, SIGNUP_HASH_PREFIX } from '../signupRoute';
import { leaderHash, getLeaderPackIdFromHash } from '../../leader/leaderRoute';

describe('signupRoute', () => {
  it('signupHash and getSignupPackIdFromHash are inverses for public and local ids', () => {
    for (const id of ['2026-10-02-matt6', 'local-2026-10-02-jhn3']) {
      expect(signupHash(id)).toBe(`${SIGNUP_HASH_PREFIX}${id}`);
      expect(getSignupPackIdFromHash(signupHash(id))).toBe(id);
    }
  });

  it('rejects anything that is not exactly #/signup/<safe id>', () => {
    expect(getSignupPackIdFromHash('#/signup/')).toBeNull();
    expect(getSignupPackIdFromHash('#/signup/a b')).toBeNull();
    expect(getSignupPackIdFromHash('#/signup/x/y')).toBeNull();
    expect(getSignupPackIdFromHash('#/pack/2026-10-02-matt6')).toBeNull();
    expect(getSignupPackIdFromHash('')).toBeNull();
  });

  it('signupUrl is origin + base + hash (the QR text), and currentSignupUrl uses this deployment', () => {
    expect(signupUrl('2026-10-02-matt6', 'https://scripturetolife.org', '/')).toBe('https://scripturetolife.org/#/signup/2026-10-02-matt6');
    expect(signupUrl('p', 'http://localhost:3000', '/bible/')).toBe('http://localhost:3000/bible/#/signup/p');
    expect(currentSignupUrl('p')).toBe(`${window.location.origin}${import.meta.env.BASE_URL}#/signup/p`);
  });

  it('leader route mirrors it', () => {
    expect(getLeaderPackIdFromHash(leaderHash('local-2026-10-02-jhn3'))).toBe('local-2026-10-02-jhn3');
    expect(getLeaderPackIdFromHash('#/leader/')).toBeNull();
    expect(getLeaderPackIdFromHash(signupHash('x'))).toBeNull();
  });
});
