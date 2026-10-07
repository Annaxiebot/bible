/**
 * guideFixture.ts — one synthetic study guide (written for these tests) and
 * a model reply for it, shared by the unit tests and the Playwright spec (R3).
 * Pure module. The PDF made from GUIDE_PAGES is committed next to this file
 * (fixtures/mark1-guide.pdf); guidePdf.test.ts pins that the two agree.
 */
import { LIFE_AREAS } from '../../../studypack/principles';

export const GUIDE_FIXTURE_FILE = 'mark1-guide.pdf';
/** Path from the repo root (the e2e spec uploads it). */
export const GUIDE_FIXTURE_PATH = `components/newstudy/guide/__tests__/fixtures/${GUIDE_FIXTURE_FILE}`;

export const GUIDE_TITLE = '马可福音 1:1-15 查经讲义';
export const GUIDE_INTRO = '马可用一句话开始他的福音书，直接宣告耶稣是谁。';
export const GUIDE_OUTLINE = [
  '一、施洗约翰预备道路（1:1-8）',
  '二、耶稣受洗与受试探（1:9-13）',
  '三、耶稣开始传道（1:14-15）',
];
/** The guide's questions as printed (numbered); the pack keeps them without the numbers. */
export const GUIDE_QUESTIONS = [
  '马可为什么一开头就称耶稣为“神的儿子”？',
  '施洗约翰的信息和穿着说明了什么？参考以赛亚书 40:3。',
  '天上的声音对耶稣说了什么？这对你有什么意义？',
  '“日期满了，神的国近了”这句话今天怎样呼召我们？',
];
/** Leader-only (ADR-0003 §6): must never reach the pack. */
export const GUIDE_LEADER_NOTE = '组长提示：问题二可以请组员先安静读第6节。';

/** Page 1: title, intro, outline. Page 2: the questions and the leader's note. */
export const GUIDE_PAGES: string[][] = [
  [GUIDE_TITLE, '第一课：神的儿子耶稣基督福音的起头', '引言：', GUIDE_INTRO, '大纲：', ...GUIDE_OUTLINE],
  ['讨论问题：', ...GUIDE_QUESTIONS.map((q, i) => `${i + 1}. ${q}`), GUIDE_LEADER_NOTE],
];

/** A question the mocked model "tidied" — not word for word, so the editor must flag it. */
export const TIDIED_QUESTION = '天上的声音说了什么？对你有何意义？';

const zh = (text: string) => ({ zh: text });

/** A zh-keywords reply: intro + outline and questions 1, 2, 4 verbatim, question 3 tidied; the rest drafted. */
export const GUIDE_GENERATED = {
  title: { zh: '神的儿子耶稣基督福音的起头', en: 'The Beginning of the Gospel' },
  keyPhrase: { zh: '「日期满了，神的国近了」', en: '“The time is fulfilled”', verse: 15 },
  context: [zh(GUIDE_INTRO), ...GUIDE_OUTLINE.map(zh)],
  originalLanguage: [zh('εὐαγγέλιον（euangelion，好消息 good news）——福音'), zh('μετανοέω（metanoeō）——悔改、回转')],
  crossRefs: [
    { ref: 'Isaiah 40:3', zh: '旷野里有人声喊着' },
    { ref: 'Malachi 3:1', zh: '我要差遣我的使者' },
  ],
  discussion: [zh(GUIDE_QUESTIONS[0]), zh(GUIDE_QUESTIONS[1]), zh(TIDIED_QUESTION), zh(GUIDE_QUESTIONS[3])],
  lifeMenu: LIFE_AREAS.map(area => ({ area, zh: `这周在${area.split(' ')[0]}上回应神的国` })),
  reflection: { tue: zh('今天我在哪里听见神的呼召？'), thu: zh('我这周怎样悔改回转？'), weekend: zh('神的国怎样临到我这周？') },
  closing: zh('这一周你怎样回应「神的国近了」？'),
  fromGuide: ['context', 'discussion'],
};

export const GUIDE_REPLY_JSON = JSON.stringify(GUIDE_GENERATED);
