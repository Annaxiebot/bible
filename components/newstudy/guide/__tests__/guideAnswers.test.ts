/**
 * guideAnswers.test.ts — the guide's leader-only answer bullets · 带领者答案核对 (ADR-0019 amendment)
 *
 * On the synthetic prep guide (guideFixtureNoPassage): the bullets under each
 * "（a）……？" question are answers, the questions and headings are not; a pack
 * line that is (part of) an answer is flagged, a guide question or a phrase it
 * shares with a question is not.
 */
import { describe, it, expect } from 'vitest';
import { splitGuideAnswers, answerMatcher, lineLooksLikeAnswer, MIN_ANSWER_MATCH_CHARS } from '../guideAnswers';
import { NP_TEXT, NP_ANSWERS, NP_QUESTIONS, NP_INTRO, LEAKED_ANSWER } from './guideFixtureNoPassage';
import { GUIDE_TEXT } from './guideFixtureRequest';
import { GUIDE_QUESTIONS } from './guideFixture';

describe('splitGuideAnswers', () => {
  it('the bullets under the questions, markers stripped (•, -, ‧); questions and headings stay in the rest', () => {
    const { answers, rest } = splitGuideAnswers(NP_TEXT);
    expect(answers).toEqual(NP_ANSWERS);
    for (const q of NP_QUESTIONS) expect(rest.some(line => line.includes(q))).toBe(true);
    expect(rest).toContain(NP_INTRO);
  });

  it('every marker the prompt names, and numbered sub-points (1) 1) ①', () => {
    const text = ['问题一：神是谁？', '· 甲答案文字', '* 乙答案文字', '▪ 丙答案文字', '(1) 丁答案文字', '2) 戊答案文字', '③ 己答案文字'].join('\n');
    expect(splitGuideAnswers(text).answers).toEqual(['甲答案文字', '乙答案文字', '丙答案文字', '丁答案文字', '戊答案文字', '己答案文字']);
  });

  it('a wrapped bullet is joined; a heading ends the answer area', () => {
    const text = ['（a）为什么？', '• 因为祂爱', '我们到底', '二、结论', '• 这不是答案，是大纲'].join('\n');
    expect(splitGuideAnswers(text).answers).toEqual(['因为祂爱我们到底']);
  });

  it('a bullet before any question is not an answer (an outline list)', () => {
    expect(splitGuideAnswers('大纲：\n• 预备道路\n• 受洗').answers).toEqual([]);
  });

  it('a guide with no bullets (the Mark fixture): no answers, nothing ever flagged', () => {
    expect(splitGuideAnswers(GUIDE_TEXT).answers).toEqual([]);
    expect(answerMatcher(GUIDE_TEXT)(GUIDE_QUESTIONS[0])).toBe(false);
  });
});

describe('answerMatcher', () => {
  const isAnswer = answerMatcher(NP_TEXT);

  it('a leaked bullet is flagged, under the verbatim normalisation (punctuation and spaces ignored)', () => {
    expect(isAnswer(LEAKED_ANSWER)).toBe(true);
    expect(isAnswer('洗脚是奴仆的工作 显出祂的谦卑。')).toBe(true);
    expect(isAnswer('显出祂的谦卑')).toBe(true);                  // part of an answer
    expect(isAnswer(`耶稣的回答：${NP_ANSWERS[2]}。`)).toBe(true);  // a whole answer inside a longer line
  });

  it('the guide\'s questions and intro, and drafted lines, are not flagged', () => {
    for (const q of NP_QUESTIONS) expect(isAnswer(q)).toBe(false);
    expect(isAnswer(NP_INTRO)).toBe(false);
    expect(isAnswer('这周在家里服事人')).toBe(false);
  });

  it('a phrase an answer shares with a question is not a leak; very short text never matches', () => {
    const shared = answerMatcher('（a）为什么耶稣为门徒洗脚？\n• 为门徒洗脚');
    expect(shared('为门徒洗脚')).toBe(false);
    expect(isAnswer('谦卑'.slice(0, MIN_ANSWER_MATCH_CHARS - 2))).toBe(false);
  });

  it('a bilingual or cross-reference line is checked in its parts', () => {
    expect(lineLooksLikeAnswer(`${LEAKED_ANSWER} · Footwashing is a servant's task`, isAnswer)).toBe(true);
    expect(lineLooksLikeAnswer(`腓立比书 2:5 · Philippians 2:5 — ${NP_ANSWERS[0]}`, isAnswer)).toBe(true);
    expect(lineLooksLikeAnswer(`${NP_QUESTIONS[0]} · Why wash their feet?`, isAnswer)).toBe(false);
  });
});
