/**
 * guidePassageFlow.test.ts — which passage a guide pack uses, automatically · 讲义经文流程 (ADR-0019 amendment)
 *
 * Through the real generateGuidePack (AI mocked, bundled chapters from disk):
 * 1. the heading names the passage (rules confident) → verses are loaded first
 *    and sent, the pack uses that passage; the AI's reading is kept for the
 *    notice, and a different reading does not override it;
 * 2. the heading names none → the request carries no passage, the AI is asked
 *    first, and its "passage" picks the bundled verses (the reply's text is
 *    never used as verses); a leaked answer bullet is flagged;
 * 3. neither → GuidePassageNotFound (the form then asks the leader to pick).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateGuidePack, guideStudyRequest, GuidePassageNotFound } from '../generateGuidePack';
import { detectGuidePassage } from '../guidePassage';
import type { LoadedGuide } from '../loadGuide';
import type { StudyPack } from '../../../studypack/packTypes';
import { STORAGE_KEYS } from '../../../../constants/storageKeys';
import { OPENROUTER_API_URL } from '../../../../services/openrouter';
import { stubFetch, chunked } from '../../__tests__/packFetchStub';
import { GD_ERR_NO_PASSAGE } from '../guideStrings';
import { NO_PASSAGE_LINE } from '../guidePrompt';
import { GUIDE_GENERATED, GUIDE_REPLY_JSON } from './guideFixture';
import { GUIDE_REQUEST, LOADED_GUIDE } from './guideFixtureRequest';
import {
  NP_FILE, NP_TEXT, NP_RANGE, NP_REPLY_JSON, NP_QUESTIONS, NP_ANSWERS, LEAKED_ANSWER, JOHN_13_1_CUV, npReplyWith,
} from './guideFixtureNoPassage';

const getItem = window.localStorage.getItem as ReturnType<typeof vi.fn>;
const section = (pack: StudyPack, kind: string) => pack.sections.find(s => s.kind === kind)!;
const MARK = { bookId: 'MRK', chapter: 1, verseFrom: 1, verseTo: 15 };
const NP_GUIDE: LoadedGuide = { name: NP_FILE, pages: 1, text: NP_TEXT, passage: detectGuidePassage(NP_TEXT) };
const NP_REQUEST = guideStudyRequest(NP_GUIDE, '2026-10-09', 'zh-keywords');
const run = (req = GUIDE_REQUEST) => generateGuidePack(req, () => {}, new AbortController().signal);

/** The URLs fetched, in order: bundled chapters and the AI call. */
const order = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map(c => (c[0] === OPENROUTER_API_URL ? 'ai' : c[0].includes('/JHN/') ? 'JHN' : c[0].includes('/MRK/') ? 'MRK' : c[0]));
const sentPrompt = (fetchMock: ReturnType<typeof stubFetch>) =>
  JSON.parse(fetchMock.mock.calls.find(c => c[0] === OPENROUTER_API_URL)![1]!.body as string).messages[1].content as string;

beforeEach(() => {
  vi.unstubAllGlobals();
  getItem.mockReset().mockImplementation((k: string) => (k === STORAGE_KEYS.OPENROUTER_API_KEY ? 'unit-test-key' : null));
});

describe('guideStudyRequest (picking the PDF starts generation)', () => {
  it('a clear heading passage: that range, no findPassage; the date and content language as given', () => {
    expect(guideStudyRequest(LOADED_GUIDE, '2026-10-09', 'bilingual')).toEqual({
      ...MARK, date: '2026-10-09', contentLanguage: 'bilingual', guide: LOADED_GUIDE,
    });
  });

  it('no clear passage: findPassage, with a placeholder range', () => {
    expect(NP_GUIDE.passage).toEqual({ range: null, confident: false });
    expect(NP_REQUEST).toMatchObject({ findPassage: true, guide: NP_GUIDE, date: '2026-10-09', contentLanguage: 'zh-keywords' });
  });
});

describe('1. the heading names the passage (rules confident)', () => {
  it('verses first and sent, as before; the AI agrees → no mismatch', async () => {
    const fetchMock = stubFetch(chunked(GUIDE_REPLY_JSON));
    const pack = await run();
    expect(order(fetchMock)).toEqual(['MRK', 'MRK', 'ai', 'MRK', 'MRK']); // after the reply: the AI's reading checked against the bundle
    expect(sentPrompt(fetchMock)).toContain('FULL PASSAGE');
    expect(pack.passageRef).toBe('马可福音 1:1–15 · Mark 1:1–15');
    expect(pack.guidePassage).toEqual(MARK);
  });

  it('the AI reads another passage → the heading\'s passage is still used; the AI\'s reading is kept for the notice', async () => {
    stubFetch(chunked(JSON.stringify({ ...GUIDE_GENERATED, passage: '马可福音 1:9-13' })));
    const pack = await run();
    expect(pack.passageRef).toBe('马可福音 1:1–15 · Mark 1:1–15');
    expect(section(pack, 'scripture').verses).toHaveLength(15);
    expect(pack.guidePassage).toEqual({ ...MARK, verseFrom: 9, verseTo: 13 });
  });

  it('the AI names no usable passage → the pack is unaffected, nothing to compare', async () => {
    stubFetch(chunked(JSON.stringify({ ...GUIDE_GENERATED, passage: undefined })));
    const pack = await run();
    expect(pack.passageRef).toBe('马可福音 1:1–15 · Mark 1:1–15');
    expect(pack.guidePassage).toBeUndefined();
  });
});

describe('2. the heading names none → the AI\'s passage', () => {
  it('the AI is asked first, without a passage; its passage picks the bundled verses; the leaked answer is flagged', async () => {
    const fetchMock = stubFetch(chunked(NP_REPLY_JSON));
    const steps: string[] = [];
    const pack = await generateGuidePack(NP_REQUEST, step => steps.push(step), new AbortController().signal);
    expect(order(fetchMock)).toEqual(['ai', 'JHN', 'JHN']);
    const prompt = sentPrompt(fetchMock);
    expect(prompt).toContain(NO_PASSAGE_LINE);
    expect(prompt).not.toContain('FULL PASSAGE');
    expect(prompt).not.toContain('马可福音'); // the placeholder range is never sent

    expect(pack.passageRef).toBe('约翰福音 13:1–17 · John 13:1–17');
    expect(pack.id).toBe('local-2026-10-09-jhn13');
    expect(pack.guidePassage).toEqual(NP_RANGE);
    const verses = section(pack, 'scripture').verses!;
    expect(verses).toHaveLength(17);
    expect(verses[0].cuv).toBe(JOHN_13_1_CUV);

    const discussion = section(pack, 'discussion');
    expect(discussion.questions).toEqual([NP_QUESTIONS[0], LEAKED_ANSWER, NP_QUESTIONS[1], NP_QUESTIONS[2]]);
    expect(discussion).toMatchObject({ origin: 'guide', notVerbatim: [], leaderAnswer: [LEAKED_ANSWER] });
    for (const s of pack.sections.filter(x => x.kind !== 'discussion')) expect(s.leaderAnswer).toBeUndefined();
    for (const answer of NP_ANSWERS.filter(a => a !== LEAKED_ANSWER)) expect(JSON.stringify(pack)).not.toContain(answer);
  });
});

describe('3. neither the heading nor the AI', () => {
  for (const [what, passage] of [
    ['missing', undefined], ['not a reference', '主为门徒洗脚'], ['a chapter John lacks', '约翰福音 22:1-5'], ['verses John 13 lacks', '约翰福音 13:30-45'],
  ] as const) {
    it(`the AI's passage is ${what} → GuidePassageNotFound, bilingual`, async () => {
      stubFetch(chunked(npReplyWith(passage)));
      const failure = run(NP_REQUEST);
      await expect(failure).rejects.toBeInstanceOf(GuidePassageNotFound);
      await expect(failure).rejects.toThrow(GD_ERR_NO_PASSAGE);
    });
  }
});
