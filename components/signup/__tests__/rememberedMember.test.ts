// A returning member's details live on their own phone (localStorage) — and nothing breaks without it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readRememberedMember, rememberMember, forgetMember } from '../rememberedMember';
import { STORAGE_KEYS } from '../../../constants/storageKeys';

const store = new Map<string, string>();
const ls = window.localStorage as unknown as Record<'getItem' | 'setItem' | 'removeItem', ReturnType<typeof vi.fn>>;

beforeEach(() => {
  store.clear();
  ls.getItem.mockReset().mockImplementation((k: string) => store.get(k) ?? null);
  ls.setItem.mockReset().mockImplementation((k: string, v: string) => { store.set(k, v); });
  ls.removeItem.mockReset().mockImplementation((k: string) => { store.delete(k); });
});

describe('rememberedMember', () => {
  it('remembers name, email, phone and consent (trimmed) under one key, and forgets them', () => {
    rememberMember({ name: ' 小明 ', email: ' ming@example.org ', phone: '', consent: false });
    expect(JSON.parse(store.get(STORAGE_KEYS.SIGNUP_MEMBER)!)).toEqual({ name: '小明', email: 'ming@example.org', phone: '', consent: false });
    expect(readRememberedMember()).toEqual({ name: '小明', email: 'ming@example.org', phone: '', consent: false });
    forgetMember();
    expect(readRememberedMember()).toBeNull();
  });

  it('nothing stored, a broken value, or no name/email → not remembered', () => {
    expect(readRememberedMember()).toBeNull();
    store.set(STORAGE_KEYS.SIGNUP_MEMBER, '{oops');
    expect(readRememberedMember()).toBeNull();
    store.set(STORAGE_KEYS.SIGNUP_MEMBER, JSON.stringify({ name: '小明' }));
    expect(readRememberedMember()).toBeNull();
  });

  it('blocked storage (private mode) never throws', () => {
    ls.getItem.mockImplementation(() => { throw new Error('blocked'); });
    ls.setItem.mockImplementation(() => { throw new Error('blocked'); });
    ls.removeItem.mockImplementation(() => { throw new Error('blocked'); });
    expect(readRememberedMember()).toBeNull();
    expect(() => rememberMember({ name: 'a', email: 'a@b.co', phone: '', consent: true })).not.toThrow();
    expect(() => forgetMember()).not.toThrow();
  });
});
