/**
 * capsPolicy.test.ts — owner/admin limits and the site-wide daily cap · 用量上限测试
 *
 * ADR-0007 "Caps": the owner (and any admin) gets AI_MONTHLY_<ROLE>_OWNER,
 * default ten times the leader default, never below the leader's limit; pack
 * generations have a site-wide daily cap (AI_DAILY_PACK_CAP, default 30) whose
 * refusal is a typed 429 daily-cap the browser shows in Chinese first.
 */
import { describe, it, expect } from 'vitest';
import { AI_ROLES, DEFAULT_MONTHLY_LIMITS } from '../policy.ts';
import {
  callerMonthlyLimit, dailyCap, ownerLimitSecret, IS_SITE_ADMIN_FUNCTION, OWNER_LIMIT_MULTIPLIER, QUOTA_RESULT, DAILY_CAPS,
} from '../caps.ts';
import { quotaFailure } from '../responses.ts';
import { IS_SITE_ADMIN_FN } from '../../../../components/admin/adminRules';
import { hostedErrorFromStatus } from '../../../../components/studypack/askAIErrors';
import { AI_DAILY_CAP_REACHED } from '../../../../components/studypack/tvHints';

const envOf = (vars: Record<string, string>) => (name: string) => vars[name] ?? '';

describe('owner / admin monthly limits', () => {
  it('a leader keeps the leader limit, owner secrets or not', () => {
    const env = envOf({ AI_MONTHLY_PACK_OWNER: '500' });
    for (const role of AI_ROLES) expect(callerMonthlyLimit(role, false, env)).toBe(DEFAULT_MONTHLY_LIMITS[role]);
  });

  it('the owner defaults to ten times the leader default (pack 100)', () => {
    expect(OWNER_LIMIT_MULTIPLIER).toBe(10);
    expect(callerMonthlyLimit('pack', true, envOf({}))).toBe(100);
    for (const role of AI_ROLES) {
      expect(callerMonthlyLimit(role, true, envOf({}))).toBe(DEFAULT_MONTHLY_LIMITS[role] * OWNER_LIMIT_MULTIPLIER);
    }
  });

  it('AI_MONTHLY_<ROLE>_OWNER overrides; junk falls back; never below the leader limit', () => {
    expect(ownerLimitSecret('pack')).toBe('AI_MONTHLY_PACK_OWNER');
    expect(ownerLimitSecret('ask')).toBe('AI_MONTHLY_ASK_OWNER');
    expect(callerMonthlyLimit('pack', true, envOf({ AI_MONTHLY_PACK_OWNER: ' 250 ' }))).toBe(250);
    expect(callerMonthlyLimit('pack', true, envOf({ AI_MONTHLY_PACK_OWNER: 'lots' }))).toBe(100);
    expect(callerMonthlyLimit('pack', true, envOf({ AI_MONTHLY_PACK_OWNER: '5', AI_MONTHLY_PACK: '20' }))).toBe(20);
  });

  it('the admin check is the portal\'s caller-scoped function (one name, pinned)', () => {
    expect(IS_SITE_ADMIN_FUNCTION).toBe(IS_SITE_ADMIN_FN);
  });
});

describe('site-wide daily cap', () => {
  it('only pack is capped: default 30, AI_DAILY_PACK_CAP overrides, junk falls back', () => {
    expect(Object.keys(DAILY_CAPS)).toEqual(['pack']);
    expect(dailyCap('pack', envOf({}))).toBe(30);
    expect(dailyCap('pack', envOf({ AI_DAILY_PACK_CAP: '12' }))).toBe(12);
    expect(dailyCap('pack', envOf({ AI_DAILY_PACK_CAP: '0' }))).toBe(0);
    expect(dailyCap('pack', envOf({ AI_DAILY_PACK_CAP: '-4' }))).toBe(30);
    for (const role of AI_ROLES.filter(r => r !== 'pack')) expect(dailyCap(role, envOf({ AI_DAILY_PACK_CAP: '1' }))).toBeNull();
  });

  it('-2 → 429 daily-cap carrying the daily cap; -1 stays the monthly quota', () => {
    expect(QUOTA_RESULT).toEqual({ monthlyFull: -1, dailyFull: -2 });
    expect(quotaFailure(-2, 'pack', 10, 30)).toEqual({ status: 429, body: { error: 'daily-cap', role: 'pack', limit: 30 } });
    expect(quotaFailure(-1, 'pack', 10, 30)).toEqual({ status: 429, body: { error: 'quota', role: 'pack', limit: 10 } });
    expect(quotaFailure(7, 'pack', 10, 30)).toBeNull();
  });

  it('the browser shows the daily-cap reply as its own Chinese-first line, never a retry or fallback', () => {
    expect(AI_DAILY_CAP_REACHED).toBe('今天的生成次数已满，请明天再试 · Today\'s generation limit is reached, try tomorrow');
    const err = hostedErrorFromStatus(429, { error: 'daily-cap', limit: 30 }, 'm');
    expect(err.kind).toBe('daily-cap');
    expect(err.message).toBe(AI_DAILY_CAP_REACHED);
    expect(err.status).toBe(429);
  });
});
