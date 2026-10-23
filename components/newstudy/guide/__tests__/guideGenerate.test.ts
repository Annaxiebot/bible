/**
 * guideGenerate.test.ts — the study-guide pipeline end to end, AI mocked · 讲义生成全流程 (ADR-0019)
 *
 * The fixture guide + a mocked reply go through the real generateGuidePack:
 * verses from the bundled 和合本 + BSB files (never the guide, never the
 * model); the guide's questions and intro land verbatim and are marked
 * 'guide'; the one tidied question is in notVerbatim; the app's own layers
 * are 'ai'; the leader-only note appears nowhere. The request goes to the
 * proxy (signed in: AI needs sign-in) as role pack with pack_source "guide",
 * which the proxy turns into the guide system text (checked through
 * finalAIBody, the same builder). markGuidePack's own rules are pinned below. The passage flow
 * (ADR-0019 amendment): rules confident → verses first, as before; not →
 * the reply's "passage" picks the bundled verses; neither → GuidePassageNotFound.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateStudyPack } from '../../generatePack';
import { generateGuidePack } from '../generateGuidePack';
import { parseStudyPack, type StudyPack } from '../../../studypack/packTypes';
import { finalAIBody } from '../../../../services/aiFinalBody';
import { signInSeam, signOutSeam } from '../../../../tests/utils/hostedSeam';
import { PACK_FROM_GUIDE_SYSTEM_PROMPT, GUIDE_TEXT_HEADING } from '../../../../supabase/functions/_shared/aiPrompts';
import { stubFetch, chunked, isAICall } from '../../__tests__/packFetchStub';
import { markGuidePack, stillNotVerbatim, guideKindsOf } from '../guidePack';
import { validateGenerated } from '../../generatedPack';
import { assemblePack } from '../../packAssembly';
import { GUIDE_GENERATED, GUIDE_REPLY_JSON, GUIDE_QUESTIONS, GUIDE_INTRO, GUIDE_LEADER_NOTE, TIDIED_QUESTION } from './guideFixture';
import { GUIDE_REQUEST, GUIDE_TEXT } from './guideFixtureRequest';

const getItem = window.localStorage.getItem as ReturnType<typeof vi.fn>;
const section = (pack: StudyPack, kind: string) => pack.sections.find(s => s.kind === kind)!;

describe('generateGuidePack', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    getItem.mockReset().mockReturnValue(null);
    signInSeam();
  });
  afterEach(signOutSeam);

  it('the guide as data to the proxy (system text server-side), verses from the bundle; sections marked; one line flagged', async () => {
    const fetchMock = stubFetch(chunked(GUIDE_REPLY_JSON));
    const pack = await generateGuidePack(GUIDE_REQUEST, () => {}, new AbortController().signal);

    const { role, ...sent } = JSON.parse(fetchMock.mock.calls.find(c => isAICall(c[0]))![1]!.body as string);
    expect(role).toBe('pack');
    expect(sent.pack_source).toBe('guide');
    expect(sent.messages.some((m: { role: string }) => m.role === 'system')).toBe(false);
    const final = JSON.parse(finalAIBody('pack', JSON.stringify(sent)));
    expect(final.messages[0].content).toContain(PACK_FROM_GUIDE_SYSTEM_PROMPT);
    expect(final.messages[1].content).toContain(`${GUIDE_TEXT_HEADING} (extracted`);
    expect(final.messages[1].content).toContain(GUIDE_TEXT);
    expect(final).not.toHaveProperty('pack_source');

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
