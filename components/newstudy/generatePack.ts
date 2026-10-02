/**
 * generatePack.ts — passage → model → validated StudyPack · 生成查经包
 *
 * 1. Load the passage from the bundled Bible data (和合本 + BSB) — never from
 *    the model (ADR-0003 §4).
 * 2. Stream one strict-JSON completion from OpenRouter (same transport as the
 *    Ask-AI overlay, askAIStream.streamChatCompletion), reporting progress.
 * 3. Extract + validate the JSON, assemble the pack, validate the pack.
 * Every failure throws a bilingual Error; a cancel throws an AbortError the
 * caller treats as "back to the form", not as a failure.
 */
import { PackVerse, StudyPack } from '../studypack/packTypes';
import { TRANSLATIONS } from '../studypack/principles';
import { PACK_GENERATION_MODEL } from '../../services/aiDefaults';
import { streamChatCompletion } from '../studypack/askAIStream';
import { fetchBundledChapter } from '../../services/bibleDataSource';
import { buildPackPrompt, PACK_SYSTEM_PROMPT, PACK_MAX_TOKENS, PACK_TEMPERATURE } from './packPrompt';
import { extractJsonObject, validateGenerated } from './generatedPack';
import { assemblePack, passageLabel, StudyRequest } from './packAssembly';
import {
  NS_STEP_VERSES, NS_STEP_AI, NS_STEP_VALIDATE, NS_PROGRESS_CHARS,
  NS_ERR_VERSES_UNAVAILABLE, NS_ERR_VERSES_OUT_OF_RANGE,
} from './newStudyStrings';

export type ProgressReporter = (step: string, detail?: string) => void;

/** The requested verses from the bundled chapter files, both translations required. */
export async function loadPassage(req: StudyRequest): Promise<PackVerse[]> {
  const [zh, en] = await Promise.all([
    fetchBundledChapter(req.bookId, req.chapter, TRANSLATIONS.zh.id),
    fetchBundledChapter(req.bookId, req.chapter, TRANSLATIONS.en.id),
  ]);
  if (!zh || !en) throw new Error(NS_ERR_VERSES_UNAVAILABLE);
  const zhByNum = new Map(zh.verses.map(v => [v.verse, v.text]));
  const enByNum = new Map(en.verses.map(v => [v.verse, v.text]));
  const verses: PackVerse[] = [];
  for (let num = req.verseFrom; num <= req.verseTo; num++) {
    const cuv = zhByNum.get(num);
    const enText = enByNum.get(num);
    if (!cuv || !enText) throw new Error(NS_ERR_VERSES_OUT_OF_RANGE);
    verses.push({ num, cuv, en: enText });
  }
  return verses;
}

export function buildPackRequestBody(req: StudyRequest, verses: PackVerse[]): string {
  return JSON.stringify({
    model: PACK_GENERATION_MODEL, // long, quality-critical output (ADR-0003 → Models)
    stream: true,
    max_tokens: PACK_MAX_TOKENS,
    temperature: PACK_TEMPERATURE,
    messages: [
      { role: 'system', content: PACK_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildPackPrompt({
          passageRef: passageLabel(req).ref,
          verses,
          lessonTitle: req.lessonTitle,
        }),
      },
    ],
  });
}

function cancelled(): Error {
  return new DOMException('Generation cancelled', 'AbortError');
}

/** Full pipeline. Resolves a validated StudyPack or throws (bilingual message, or AbortError on cancel). */
export async function generateStudyPack(
  req: StudyRequest,
  onProgress: ProgressReporter,
  signal: AbortSignal
): Promise<StudyPack> {
  onProgress(NS_STEP_VERSES);
  const verses = await loadPassage(req);
  if (signal.aborted) throw cancelled();

  onProgress(NS_STEP_AI);
  let received = 0;
  const raw = await streamChatCompletion(
    buildPackRequestBody(req, verses),
    delta => {
      received += delta.length;
      onProgress(NS_STEP_AI, NS_PROGRESS_CHARS.replace(/\{n\}/g, String(received)));
    },
    signal,
    'Scripture to Life - New study' // HTTP header: ASCII only
  );
  // streamChatCompletion resolves with partial text on abort; that is a cancel, not a half-pack.
  if (signal.aborted) throw cancelled();

  onProgress(NS_STEP_VALIDATE);
  const generated = validateGenerated(extractJsonObject(raw));
  return assemblePack(req, verses, generated);
}
