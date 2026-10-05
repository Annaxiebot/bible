/**
 * promptText.test.ts — the kind label appears once · 跟进问题不重复类别
 *
 * The owner's live case: the page showed "这次的问题 This time · 周末回顾
 * Weekend reflection" and then "周末回顾：周末:回顾本周… · End of week:
 * Weekend: Looking back…". The one helper (shared by the check-in page and
 * the email template) strips every leading kind label from each half.
 */
import { describe, it, expect } from 'vitest';
import { promptWithoutKindLabel, halfWithoutKindLabel, collapseRepeatedKindLabel } from '../promptText.ts';
import { renderCheckin, CheckinPack } from '../templates.ts';

describe('promptWithoutKindLabel', () => {
  it('strips the doubled weekend labels from both halves (the exact live line)', () => {
    expect(promptWithoutKindLabel('周末回顾：周末:回顾本周… · End of week: Weekend: Looking back…')).toBe('回顾本周… · Looking back…');
  });

  it('handles 周二/周四/周末 with ":" or "：", and Tuesday/Thursday/Weekend/End of week in English', () => {
    expect(promptWithoutKindLabel('周二跟进：操练做了吗？ · Tuesday check-in: did it happen?')).toBe('操练做了吗？ · did it happen?');
    expect(promptWithoutKindLabel('周四：还在坚持吗？ · Thursday: still at it?')).toBe('还在坚持吗？ · still at it?');
    expect(promptWithoutKindLabel('周二: 做了吗 · Tuesday: done?')).toBe('做了吗 · done?');
    expect(promptWithoutKindLabel('周末：改变了什么 · Weekend reflection: what changed?')).toBe('改变了什么 · what changed?');
    expect(promptWithoutKindLabel('周末回顾：用你自己的话说，你里面有什么改变？ · End of week: what changed in you, in your own words?'))
      .toBe('用你自己的话说，你里面有什么改变？ · what changed in you, in your own words?');
  });

  it('leaves lines without a leading label alone, never empties a half, and keeps single-language lines working', () => {
    expect(promptWithoutKindLabel('周末我们一起散步了吗？ · Did we walk this weekend?')).toBe('周末我们一起散步了吗？ · Did we walk this weekend?');
    expect(promptWithoutKindLabel('Weekend plans: what helped?')).toBe('Weekend plans: what helped?');
    expect(promptWithoutKindLabel('周末： · Weekend:')).toBe('周末： · Weekend:');
    expect(promptWithoutKindLabel('周四跟进：坚持了吗？')).toBe('坚持了吗？');
  });

  it('the email template uses it (one helper, R3): the body prompt has no kind label', () => {
    const pack: CheckinPack = {
      id: 'p', title: 'T', leaderId: 'uid',
      prompts: { tue: 'TUE', thu: 'THU', weekend: '周末回顾：周末:回顾本周… · End of week: Weekend: Looking back…' },
    };
    const lines = renderCheckin('weekend', pack, { name: 'n', signupId: 's', practices: [] }).text.split('\n');
    expect(lines[1]).toBe('回顾本周… · Looking back…');
  });
});

describe('TV reflection labels (owner: "周末回顾：周末:…" showed two labels)', () => {
  it('halfWithoutKindLabel drops the model\'s own label before the builder adds the app\'s', () => {
    expect(halfWithoutKindLabel('周末:回顾本周,你在哪个时刻最清楚地听到智慧的呼唤?')).toBe('回顾本周,你在哪个时刻最清楚地听到智慧的呼唤?');
    expect(halfWithoutKindLabel('Weekend: Looking back, when did you hear wisdom?')).toBe('Looking back, when did you hear wisdom?');
    expect(halfWithoutKindLabel('没有标签的问题')).toBe('没有标签的问题');
  });

  it('collapseRepeatedKindLabel keeps the first label of each half and drops the repeat', () => {
    const stored = '周末回顾：周末:回顾本周,你在哪个时刻最清楚地听到智慧的呼唤?你如何回应? · End of week: Weekend: Looking back, when this week did you most clearly hear wisdom calling? How did you respond?';
    expect(collapseRepeatedKindLabel(stored)).toBe(
      '周末回顾：回顾本周,你在哪个时刻最清楚地听到智慧的呼唤?你如何回应? · End of week: Looking back, when this week did you most clearly hear wisdom calling? How did you respond?',
    );
    expect(collapseRepeatedKindLabel('周二跟进：今天做了吗？ · Tuesday check-in: Did it happen?')).toBe('周二跟进：今天做了吗？ · Tuesday check-in: Did it happen?');
    expect(collapseRepeatedKindLabel('隐私规则：反思默认私密')).toBe('隐私规则：反思默认私密');
  });
});
