/**
 * fixtures.ts — one valid model reply for John 3:22–36, shared by the unit
 * tests and the Playwright spec (R3: the shape lives here once). Pure module.
 */
import { LIFE_AREAS } from '../../studypack/principles';
import { StudyRequest } from '../packAssembly';

export const JOHN3_REQUEST: StudyRequest = {
  bookId: 'JHN', chapter: 3, verseFrom: 22, verseTo: 36, date: '2026-10-02',
};

const bi = (zh: string, en: string) => ({ zh, en });

/** What a well-behaved model returns (the parsed JSON object). */
export const JOHN3_GENERATED = {
  title: bi('祂必兴旺，我必衰微', 'He Must Increase'),
  keyPhrase: { zh: '「他必兴旺，我必衰微」', en: '“He must increase; I must decrease”', verse: 30 },
  context: [
    bi('约翰的门徒为施洗的事起了争论', 'John\'s disciples argue about baptism (v.25)'),
    bi('施洗约翰把自己定位为新郎的朋友', 'John places himself as the friend of the bridegroom (v.29)'),
    bi('第31–36节总结了从上头来者的见证', 'vv.31–36 sum up the testimony of the one from above'),
  ],
  originalLanguage: [
    bi('αὐξάνω (auxanō)——生长、增多', 'auxanō — to grow, to increase (v.30)'),
    bi('ἐλαττόω (elattoō)——减少、变小', 'elattoō — to decrease, to become less (v.30)'),
  ],
  crossRefs: [
    { ref: 'John 1:26-27', ...bi('约翰早已说过自己不配', 'John already said he was unworthy') },
    { ref: 'Matthew 3:11', ...bi('施洗约翰指向更大的一位', 'the Baptist points to the greater one') },
    { ref: 'Narnia 3:1', ...bi('无效书卷', 'invalid book — must be dropped') },
    { ref: 'Philippians 2:3', ...bi('看别人比自己强', 'count others more significant') },
    { ref: 'John 99:1', ...bi('无效章', 'invalid chapter — must be dropped') },
  ],
  discussion: [
    bi('约翰的门徒在意什么？', 'What are John\'s disciples worried about (v.26)?'),
    bi('「从天上赐的」这句话如何改变比较？', 'How does "given from heaven" (v.27) change comparison?'),
    bi('新郎的朋友喜乐的根源是什么？', 'Where does the friend of the bridegroom find joy (v.29)?'),
    bi('在你的生活里，「衰微」意味着什么？', 'What would "decrease" look like in your week (v.30)?'),
    bi('第36节的两条路对你意味着什么？', 'What do the two ways of v.36 mean for you?'),
  ],
  lifeMenu: [
    { area: LIFE_AREAS[6], ...bi('每天用第30节祷告一次', 'Pray v.30 once a day') },
    { area: 'Health', ...bi('一周三次散步时默想第30节', 'Walk three times this week, meditating on v.30') },
    { area: '关系', ...bi('为一个被提拔的同伴真心庆贺', 'Celebrate one peer\'s promotion sincerely') },
    { area: LIFE_AREAS[2], ...bi('让家人先说话，自己后说', 'Let a family member speak first') },
    { area: LIFE_AREAS[3], ...bi('把一份功劳归给同事', 'Give credit for one piece of work to a colleague') },
    { area: LIFE_AREAS[4], ...bi('嫉妒上来时写下第27节', 'Write v.27 when envy rises') },
    { area: LIFE_AREAS[5], ...bi('本周减少一项为面子的开支', 'Cut one expense that exists for appearances') },
  ],
  reflection: {
    tue: bi('操练做了吗？', 'Did the practice happen?'),
    thu: bi('什么时候「衰微」最难？', 'When was "decrease" hardest?'),
    weekend: bi('你里面有什么改变？', 'What changed in you?'),
  },
  closing: bi('这周「衰微」在哪里与真实生活相撞？', 'Where did "decrease" collide with real life this week?'),
};

/** The valid cross-references above, in order (the two invalid ones dropped). */
export const JOHN3_VALID_CROSS_REF_COUNT = 3;

export const JOHN3_REPLY_JSON = JSON.stringify(JOHN3_GENERATED);
