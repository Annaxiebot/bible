/**
 * checkinRoute.test.ts — "#/checkin/<uuid>[/<kind>]" parsing + URL · 跟进路由测试
 */
import { describe, it, expect } from 'vitest';
import { checkinHash, getCheckinFromHash, checkinUrl, isCheckinKind, checkinStopHash, getCheckinStopFromHash } from '../checkinRoute';
import { resolveRootView } from '../../landing/landingRoute';

const ID = '7d4e8b2a-1c3f-4a5b-9e6d-0f1a2b3c4d5e';

describe('checkinRoute', () => {
  it('builds and parses the hash with and without a kind; the id must be a uuid', () => {
    expect(checkinHash(ID)).toBe(`#/checkin/${ID}`);
    expect(checkinHash(ID, 'thu')).toBe(`#/checkin/${ID}/thu`);
    expect(getCheckinFromHash(checkinHash(ID))).toEqual({ signupId: ID, kind: null });
    expect(getCheckinFromHash(checkinHash(ID, 'weekend'))).toEqual({ signupId: ID, kind: 'weekend' });
    expect(getCheckinFromHash('#/checkin/not-a-uuid')).toBeNull();
    expect(getCheckinFromHash(`#/checkin/${ID}/mon`)).toBeNull();
    expect(getCheckinFromHash(`#/checkin/${ID}/`)).toBeNull();
    expect(isCheckinKind('tue')).toBe(true);
    expect(isCheckinKind('welcome')).toBe(false);
  });

  it('the root gate routes it to the check-in view; a bad token falls through to the app', () => {
    expect(resolveRootView(checkinHash(ID, 'tue'))).toBe('checkin');
    expect(resolveRootView('#/checkin/abc')).toBe('app');
  });

  it('the stop page "#/checkin/<uuid>/stop" is its own route, never a check-in kind (ADR-0009)', () => {
    expect(checkinStopHash(ID)).toBe(`#/checkin/${ID}/stop`);
    expect(getCheckinStopFromHash(checkinStopHash(ID))).toBe(ID);
    expect(getCheckinFromHash(checkinStopHash(ID))).toBeNull();
    expect(getCheckinStopFromHash(checkinHash(ID, 'tue'))).toBeNull();
    expect(getCheckinStopFromHash('#/checkin/abc/stop')).toBeNull();
    expect(resolveRootView(checkinStopHash(ID))).toBe('checkinStop');
    expect(resolveRootView('#/checkin/abc/stop')).toBe('app');
  });

  it('the absolute URL is origin + base + hash (no uid, no pack id)', () => {
    const url = checkinUrl(ID, 'tue', 'https://scripturetolife.org', '/');
    expect(url).toBe(`https://scripturetolife.org/#/checkin/${ID}/tue`);
    expect(url).not.toMatch(/uid|pack/);
  });
});
