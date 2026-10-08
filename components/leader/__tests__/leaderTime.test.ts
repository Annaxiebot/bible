/**
 * leaderTime.test.ts — compact local times for the leader page · 组长页时间测试
 */
import { describe, it, expect } from 'vitest';
import { compactTime, fullTime } from '../leaderTime';

describe('leaderTime', () => {
  it('compactTime: month/day and 24-hour local time, minutes padded, no year', () => {
    const local = new Date(2026, 9, 6, 15, 12, 40);          // 6 Oct 2026, 15:12 local
    expect(compactTime(local.toISOString())).toBe('10/6 15:12');
    expect(compactTime(new Date(2026, 0, 9, 7, 5).toISOString())).toBe('1/9 07:05');
  });

  it('fullTime: the locale timestamp, for the tooltip', () => {
    const iso = new Date(2026, 9, 6, 15, 12).toISOString();
    expect(fullTime(iso)).toBe(new Date(iso).toLocaleString());
  });
});
