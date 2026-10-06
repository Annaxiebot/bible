/**
 * askAnswers.ts — realistic Ask-AI answers for the overlay fit specs · 问AI长回答样本
 *
 * One copy (R3) shared by tv-ask-ai-fit.spec.ts and the before/after
 * screenshot run. REALISTIC_ANSWER mirrors the owner's report: a bilingual
 * reply (中文 first, then English) with a whole-Bible paragraph, ~900
 * characters. HUGE_ANSWER (~3000 characters) is deliberately beyond what
 * any scale down to the floor can fit, so the overlay must fall back to
 * its thin themed scrollbar.
 */

const ZH = [
  '门徒惊讶耶稣与撒玛利亚妇人交谈（v.27），因为当时犹太人与撒玛利亚人素不往来，拉比也不在公开场合与妇人说话。' +
  '耶稣却主动跨越种族、性别和名声的界限，向一个被众人回避的人启示自己（v.26）。',
  '纵观整本圣经，这正是神一贯的心意：从应许亚伯拉罕“地上的万族都要因你得福”，到先知预言列国要归向神的光，' +
  '再到五旬节圣灵浇灌各方的人，最后启示录中各国各族各民各方同站在宝座前。福音从来不只属于一个民族，' +
  '而是要临到每一个被遗忘、被轻看的人。今天我们也被邀请，走近那些我们习惯回避的人。',
];

const EN = [
  'The disciples were surprised that Jesus spoke with the Samaritan woman (v.27): Jews and Samaritans avoided ' +
  'each other, and rabbis did not talk with women in public. Yet Jesus crossed lines of race, gender and ' +
  'reputation, and revealed Himself to someone others shunned (v.26).',
  'Across the whole Bible this is God\'s steady heart: from the promise that all peoples will be blessed through ' +
  'Abraham, to the prophets\' vision of nations coming to God\'s light, to the Spirit poured out at Pentecost, and ' +
  'finally every nation, tribe and language before the throne. The gospel reaches the forgotten and overlooked; ' +
  'we too are invited to draw near to the people we tend to avoid.',
];

/** ~900 characters: two Chinese paragraphs, then their English halves. */
export const REALISTIC_ANSWER = [...ZH, ...EN].join('\n\n');

/** Length of the deliberately oversized answer. */
export const HUGE_ANSWER_CHARS = 3000;

/** 3000 characters: the realistic answer repeated — no scale down to the floor fits it. */
export const HUGE_ANSWER = Array(4).fill(REALISTIC_ANSWER).join('\n\n').slice(0, HUGE_ANSWER_CHARS);

/** Split an answer into stream chunks of `size` characters (the way tokens arrive). */
export function streamChunks(text: string, size = 24): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}
