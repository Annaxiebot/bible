/**
 * sharingPrompt.ts — the one prompt for last week's sharing · 上周分享提示词
 *
 * ADR-0008. The model sees only anonymised material (sharingData): practice
 * counts per life area, scrubbed answer texts, last week's closing question
 * and this week's title / passage. Content rules come from principles.ts
 * (SHARING_CONTENT_CONTRACT + the CURRENT pack's CONTENT_LANGUAGE_CONTRACTS
 * line rule) — never pasted here (R3). The reply is one strict JSON object
 * (sharingReply validates it).
 */
import type { StudyPack } from '../studypack/packTypes';
import { packContentLanguage } from '../studypack/packTypes';
import { CONTENT_LANGUAGE_CONTRACTS, ContentLanguage, SHARING_CONTENT_CONTRACT } from '../studypack/principles';
import { packGenerationModel } from '../../services/aiDefaults';
import { ROLE_MAX_TOKENS } from '../../supabase/functions/ai-proxy/policy';
import { PACK_COMPACT_JSON_RULE } from '../newstudy/packPrompt';
import type { SharingMaterial } from './sharingData';

export const SHARING_THEMES_MIN = 2;
export const SHARING_THEMES_MAX = 3;
export const SHARING_QUOTES_MAX = 3;
/** A quote's Chinese half: at most this many characters (字). */
export const QUOTE_MAX_ZH_CHARS = 40;
/** A quote's English half (en-keywords / bilingual): at most this many characters. */
export const QUOTE_MAX_EN_CHARS = 120;
/** The proxy clamps the sharing role to the same cap (one number, policy.ts). */
export const SHARING_MAX_TOKENS = ROLE_MAX_TOKENS.sharing;
export const SHARING_TEMPERATURE = 0.3;

/** The JSON shape for a mode: each item carries the halves the mode asks for (same convention as packPrompt.generatedShape). */
export function sharingShape(mode: ContentLanguage): string {
  const item = (zh: string, en: string) => {
    if (mode === 'zh-keywords') return `{"zh": "${zh}"}`;
    if (mode === 'en-keywords') return `{"en": "${en}"}`;
    return `{"zh": "${zh}", "en": "${en}"}`;
  };
  return [
    '{',
    `  "themes": [${item('共同主题一句话', 'one-line shared theme')}, ${item('…', '…')}],`,
    `  "quotes": [${item('一句匿名转述', 'one anonymised paraphrase')}],`,
    `  "question": ${item('连接上周操练与本周经文的开场问题', 'opening question linking last week\'s practice to this week')}`,
    '}',
  ].join('\n');
}

export interface SharingPromptInput {
  current: Pick<StudyPack, 'title' | 'passageRef' | 'contentLanguage'>;
  material: Pick<SharingMaterial, 'practices' | 'sharedAnswers' | 'closingQuestion'>;
}

function materialBlock(material: SharingPromptInput['material']): string {
  const practices = material.practices.map(p => `- ${p.area}: ${p.count}`).join('\n') || '- (none)';
  const answers = material.sharedAnswers.map((a, i) => `${i + 1}. ${a}`).join('\n');
  return [
    `PRACTICES MEMBERS CHOSE LAST WEEK (area: how many):\n${practices}`,
    `LAST WEEK'S CLOSING QUESTION: ${material.closingQuestion ?? '(none)'}`,
    `ANSWERS MEMBERS CHOSE TO SHARE WITH THE LEADER (anonymised; ${material.sharedAnswers.length}):\n${answers}`,
  ].join('\n\n');
}

export function buildSharingPrompt(input: SharingPromptInput): string {
  const mode = packContentLanguage(input.current);
  return [
    `Prepare the opening slide of this week's study "${input.current.title}" (${input.current.passageRef}): a short summary of what the group shared about last week's practice.`,
    materialBlock(input.material),
    SHARING_CONTENT_CONTRACT,
    CONTENT_LANGUAGE_CONTRACTS[mode].lineRule,
    [
      `COUNTS: themes = ${SHARING_THEMES_MIN}–${SHARING_THEMES_MAX} short lines on what came up across the answers;`,
      `quotes = 0–${SHARING_QUOTES_MAX} short anonymised paraphrases of individual answers (each ≤ ${QUOTE_MAX_ZH_CHARS} 字),`,
      'fewer when the answers are few or too personal; question = ONE opening question linking last week\'s',
      'practice to this week\'s passage. There is no title or keyPhrase here.',
    ].join('\n'),
    PACK_COMPACT_JSON_RULE,
    `Return STRICT JSON with exactly this shape (no extra keys):\n${sharingShape(mode)}`,
  ].join('\n\n');
}

/** The streamed chat/completions body in the data form (role 'sharing'; the proxy picks the model and owns the system message, ADR-0014; an own key uses the pack model). */
export function buildSharingRequestBody(input: SharingPromptInput): string {
  return JSON.stringify({
    model: packGenerationModel(),
    stream: true,
    max_tokens: SHARING_MAX_TOKENS,
    temperature: SHARING_TEMPERATURE,
    messages: [
      { role: 'user', content: buildSharingPrompt(input) },
    ],
  });
}
