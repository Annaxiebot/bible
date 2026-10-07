/**
 * guideFixtureNoPassage.ts — a leader's prep guide (预查版) whose heading names no passage · 无经文标题的讲义
 *
 * Synthetic text written for these tests (not the owner's PDF), modelled on
 * the structure the owner met: lettered questions "（a）……？", each followed by
 * the leader's suggested answers as bullet lines. Nothing in it is a
 * reference the rules can read, so the AI's "passage" decides (John 13:1–17).
 * The mocked reply leaks one answer bullet into the discussion. Pure module,
 * shared by the unit tests and the Playwright spec (R3); the e2e writes the
 * PDF from NP_PAGES with pdfWriter.
 */
import { LIFE_AREAS } from '../../../studypack/principles';

export const NP_FILE = 'footwashing-guide.pdf';
export const NP_TITLE = '第三课 主为门徒洗脚';
export const NP_INTRO = '逾越节以前，主在最后的晚餐中留下了一个服事的榜样。';
export const NP_QUESTIONS = [
  '耶稣明知自己将要离世归父，为什么还要为门徒洗脚？',
  '彼得起初为什么不肯让耶稣洗他的脚？',
  '耶稣说“我给你们作了榜样”，这周你可以怎样彼此洗脚？',
];
/** The leader's suggested answers, as bullets under the questions — leader-only. */
export const NP_ANSWERS = [
  '祂爱世间属自己的人，就爱他们到底',
  '洗脚是奴仆的工作，显出祂的谦卑',
  '他觉得主不该做这样卑微的事',
  '他还不明白属灵的洁净',
  '可以从家里最不起眼的服事开始',
];
/** The one answer the mocked model copied into the discussion. */
export const LEAKED_ANSWER = NP_ANSWERS[1];

export const NP_PAGES: string[][] = [[
  '预查版 带领者用', NP_TITLE, '引言：', NP_INTRO, '讨论问题：',
  `（a）${NP_QUESTIONS[0]}`, `  • ${NP_ANSWERS[0]}`, `  • ${NP_ANSWERS[1]}`,
  `（b）${NP_QUESTIONS[1]}`, `  • ${NP_ANSWERS[2]}`, `  - ${NP_ANSWERS[3]}`,
  `（c）${NP_QUESTIONS[2]}`, `  ‧ ${NP_ANSWERS[4]}`,
]];
export const NP_TEXT = NP_PAGES.map(page => page.join('\n')).join('\n\n');

/** The AI's reading of the guide. */
export const NP_PASSAGE = '约翰福音 13:1-17';
export const NP_RANGE = { bookId: 'JHN', chapter: 13, verseFrom: 1, verseTo: 17 };
/** John 13:1 in the bundled 和合本 — the verses come from the app, never the reply. */
export const JOHN_13_1_CUV = '逾越节以前，耶稣知道自己离世归父的时候到了。他既然爱世间属自己的人，就爱他们到底。';

const zh = (text: string) => ({ zh: text });

/** A zh-keywords reply: the guide's intro and questions word for word — plus one leaked answer bullet. */
export const NP_GENERATED = {
  title: { zh: '主为门徒洗脚', en: 'Jesus Washes the Disciples\' Feet' },
  keyPhrase: { zh: '「我给你们作了榜样」', en: '“I have set you an example”', verse: 15 },
  context: [zh(NP_INTRO)],
  originalLanguage: [zh('νίπτω（niptō）——洗')],
  crossRefs: [{ ref: 'Philippians 2:5-8', zh: '基督虚己' }],
  discussion: [zh(NP_QUESTIONS[0]), zh(LEAKED_ANSWER), zh(NP_QUESTIONS[1]), zh(NP_QUESTIONS[2])],
  lifeMenu: LIFE_AREAS.map(area => ({ area, zh: `这周在${area.split(' ')[0]}上服事人` })),
  reflection: { tue: zh('今天我服事了谁？'), thu: zh('我在哪里需要放下身段？'), weekend: zh('这周的洗脚榜样') },
  closing: zh('这一周你为谁洗了脚？'),
  fromGuide: ['context', 'discussion'],
  passage: NP_PASSAGE,
};

export const NP_REPLY_JSON = JSON.stringify(NP_GENERATED);

/** The reply with another "passage" value (missing, unusable …). */
export function npReplyWith(passage: unknown): string {
  return JSON.stringify({ ...NP_GENERATED, passage });
}
