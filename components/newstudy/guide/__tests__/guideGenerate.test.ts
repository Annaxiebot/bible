/**
 * guideGenerate.test.ts — the study-guide pipeline end to end, AI mocked · 讲义生成全流程 (ADR-0019)
 *
 * The fixture guide + a mocked reply go through the real generateStudyPack:
 * verses from the bundled 和合本 + BSB files (never the guide, never the
 * model); the guide's questions and intro land verbatim and are marked
 * 'guide'; the one tidied question is in notVerbatim; the app's own layers
 * are 'ai'; the leader-only note appears nowhere. The request goes out as
 * role pack with pack_source "guide" (hosted) or with the guide system text
 * (own key). markGuidePack's own rules are pinned below.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateStudyPack } from '../../generatePack';
import { parseStudyPack, type StudyPack } from '../../../studypack/packTypes';
import { STORAGE_KEYS } from '../../../../constants/storageKeys';
import { OPENROUTER_API_URL } from '../../../../services/openrouter';
import { PACK_FROM_GUIDE_SYSTEM_PROMPT, GUIDE_TEXT_HEADING } from '../../../../supabase/functions/_shared/aiPrompts';
import { stubFetch, chunked, HOSTED_PATH } from '../../__tests__/packFetchStub';
import { markGuidePack, stillNotVerbatim, guideKindsOf } from '../guidePack';
import { validateGenerated } from '../../generatedPack';
import { assemblePack } from '../../packAssembly';
import { GUIDE_GENERATED, GUIDE_REPLY_JSON, GUIDE_QUESTIONS, GUIDE_INTRO, GUIDE_LEADER_NOTE, TIDIED_QUESTION } from './guideFixture';
import { GUIDE_REQUEST, GUIDE_TEXT } from './guideFixtureRequest';

const getItem = window.localStorage.getItem as ReturnType<typeof vi.fn>;
const section = (pack: StudyPack, kind: string) => pack.sections.find(s => s.kind === kind)!;

describe('generateStudyPack with a guide', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    getItem.mockReset().mockImplementation((k: string) => (k === STORAGE_KEYS.OPENROUTER_API_KEY ? 'unit-test-key' : null));
  });

  it('own key: the guide system text first, the guide as data, verses from the bundle; sections marked; one line flagged', async () => {
    const fetchMock = stubFetch(chunked(GUIDE_REPLY_JSON));
    const pack = await generateStudyPack(GUIDE_REQUEST, () => {}, new AbortController().signal);

    const sent = JSON.parse(fetchMock.mock.calls.find(c => c[0] === OPENROUTER_API_URL)![1]!.body as string);
    expect(sent.messages[0].content).toContain(PACK_FROM_GUIDE_SYSTEM_PROMPT);
    expect(sent.messages[1].content).toContain(`${GUIDE_TEXT_HEADING} (extracted`);
    expect(sent.messages[1].content).toContain(GUIDE_TEXT);
    expect(sent).not.toHaveProperty('pack_source');

    const verses = section(pack, 'scripture').verses!;
    expect(verses).toHaveLength(15);
    expect(verses[0]).toEqual({ num: 1, cuv: '神的儿子，耶稣基督福音的起头。', en: 'This is the beginning of the gospel of Jesus Christ, the Son of God.' });

    const discussion = section(pack, 'discussion');
    expect(discussion.questions).toEqual([GUIDE_QUESTIONS[0], GUIDE_QUESTIONS[1], TIDIED_QUESTION, GUIDE_QUESTIONS[3]]);
    expect(discussion.origin).toBe('guide');
    expect(discussion.notVerbatim).toEqual([TIDIED_QUESTION]);
    expect(section(pack, 'context')).toMatchObject({ origin: 'guide', notVerbatim: [] });
    expect(section(pack, 'context').body![0]).toBe(GUIDE_INTRO);
    for (const kind of ['originalLanguage', 'crossRefs', 'lifeMenu', 'reflection', 'closing']) {
      expect(section(pack, kind).origin).toBe('ai');
    }
    for (const kind of ['title', 'scripture', 'qr']) expect(section(pack, kind).origin).toBeUndefined();
    expect(JSON.stringify(pack)).not.toContain(GUIDE_LEADER_NOTE);
    expect(parseStudyPack(pack)).toEqual(pack); // the same validation as every pack
  });

  it('hosted: role pack with pack_source "guide" and no system message', async () => {
    getItem.mockReset().mockReturnValue(null);
    const seams = window as Window & { __LEADER_E2E__?: unknown; __SUPABASE_E2E__?: unknown };
    seams.__LEADER_E2E__ = { uid: 'e2e-uid' };
    seams.__SUPABASE_E2E__ = { url: 'http://localhost:3000/e2e-supabase', anonKey: 'e2e-anon' };
    try {
      const fetchMock = stubFetch(chunked(GUIDE_REPLY_JSON));
      await generateStudyPack(GUIDE_REQUEST, () => {}, new AbortController().signal);
      const body = JSON.parse(fetchMock.mock.calls.find(c => c[0].endsWith(HOSTED_PATH))![1]!.body as string);
      expect(body).toMatchObject({ role: 'pack', pack_source: 'guide' });
      expect(body.messages.some((m: { role: string }) => m.role === 'system')).toBe(false);
    } finally {
      delete seams.__LEADER_E2E__;
      delete seams.__SUPABASE_E2E__;
    }
  });

  it('without a guide the pack carries no origin fields (control)', async () => {
    stubFetch(chunked(GUIDE_REPLY_JSON));
    const pack = await generateStudyPack({ ...GUIDE_REQUEST, guide: undefined }, () => {}, new AbortController().signal);
    expect(pack.sections.every(s => s.origin === undefined && s.notVerbatim === undefined)).toBe(true);
  });
});

describe('markGuidePack', () => {
  const mark = (raw: Record<string, unknown>, mode: 'zh-keywords' | 'bilingual' = 'zh-keywords') => {
    const gen = validateGenerated(raw, mode);
    return markGuidePack(assemblePack({ ...GUIDE_REQUEST, contentLanguage: mode }, [{ num: 1, cuv: 'c', en: 'e' }], gen), gen, raw, GUIDE_TEXT, mode);
  };

  it('fromGuide keeps only context / originalLanguage / discussion', () => {
    expect(guideKindsOf({ fromGuide: ['discussion', 'lifeMenu', 'closing', 'context'] })).toEqual(['context', 'discussion']);
    expect(guideKindsOf({ fromGuide: 'discussion' })).toEqual([]);
    expect(section(mark({ ...GUIDE_GENERATED, fromGuide: ['lifeMenu'] }), 'lifeMenu').origin).toBe('ai');
  });

  it('an unlisted section that holds guide lines is still checked (origin guide, flags kept)', () => {
    const pack = mark({ ...GUIDE_GENERATED, fromGuide: [] });
    expect(section(pack, 'discussion')).toMatchObject({ origin: 'guide', notVerbatim: [TIDIED_QUESTION] });
  });

  it('a listed section with no guide line at all: every line flagged', () => {
    const pack = mark({ ...GUIDE_GENERATED, fromGuide: ['originalLanguage'] });
    const notes = section(pack, 'originalLanguage');
    expect(notes.origin).toBe('guide');
    expect(notes.notVerbatim).toEqual(notes.body);
  });

  it('bilingual: a flagged line is stored exactly as the editor shows it (中文 · English)', () => {
    const bi = (zh: string, en: string) => ({ zh, en });
    const raw = {
      ...GUIDE_GENERATED,
      title: bi('起头', 'Beginning'),
      context: [bi(GUIDE_INTRO, 'Mark opens by saying who Jesus is.')],
      originalLanguage: [bi('a', 'b')],
      crossRefs: [{ ref: 'Isaiah 40:3', ...bi('人声', 'a voice') }],
      discussion: [bi(GUIDE_QUESTIONS[0], 'Why the Son of God?'), bi(TIDIED_QUESTION, 'What did the voice say?')],
      lifeMenu: GUIDE_GENERATED.lifeMenu.map(l => ({ ...l, en: 'practice' })),
      reflection: { tue: bi('t', 't'), thu: bi('t', 't'), weekend: bi('w', 'w') },
      closing: bi('c', 'c'),
    };
    expect(section(mark(raw, 'bilingual'), 'discussion').notVerbatim).toEqual([`${TIDIED_QUESTION} · What did the voice say?`]);
  });

  it('stillNotVerbatim: an edited line loses its flag', () => {
    const discussion = section(mark(GUIDE_GENERATED), 'discussion');
    expect(stillNotVerbatim(discussion)).toEqual([TIDIED_QUESTION]);
    const edited = { ...discussion, questions: discussion.questions!.map(q => (q === TIDIED_QUESTION ? GUIDE_QUESTIONS[2] : q)) };
    expect(stillNotVerbatim(edited)).toEqual([]);
  });
});
