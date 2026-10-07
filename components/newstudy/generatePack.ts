/**
 * generatePack.ts — passage → model → validated StudyPack · 生成查经包
 *
 * 1. Load the passage from the bundled Bible data (和合本 + BSB) — never from
 *    the model (ADR-0003 §4).
 * 2. Stream one strict-JSON completion (role 'pack'; same transport as the
 *    Ask-AI overlay, askAIStream.streamChatCompletionDetailed), reporting
 *    progress. A finish_reason of "length" gets ONE continuation turn (the
 *    partial text as the assistant message, PACK_CONTINUE_PROMPT as the user
 *    message); the two replies are concatenated. A second "length" is the
 *    honest NS_ERR_OUTPUT_LIMIT with the character count.
 * 3. Extract + validate the JSON, assemble the pack, validate the pack. An
 *    incomplete JSON for any other reason keeps NS_ERR_NO_JSON and names the
 *    served model.
 * With a study guide (req.guide, ADR-0019) step 2 sends the guide request
 * (guide/guidePrompt) and step 3 also marks each section's origin and the
 * guide lines that are not word for word (guide/guidePack).
 * Every failure throws a bilingual Error; a cancel throws an AbortError the
 * caller treats as "back to the form", not as a failure.
 */
import { PackVerse, StudyPack } from '../studypack/packTypes';
import { TRANSLATIONS } from '../studypack/principles';
import { packGenerationModel } from '../../services/aiDefaults';
import { streamChatCompletionDetailed, StreamOutcome, AIRequestMeta } from '../studypack/askAIStream';
import { withModel } from '../studypack/tvHints';
import { fetchBundledChapter } from '../../services/bibleDataSource';
import {
  buildPackPrompt, PACK_MAX_TOKENS, PACK_TEMPERATURE, PACK_CONTINUE_PROMPT,
} from './packPrompt';
import { extractJsonObject, validateGenerated, GeneratedContent } from './generatedPack';
import { assemblePack, passageLabel, StudyRequest, VerseRange } from './packAssembly';
import { buildGuideRequestBody } from './guide/guidePrompt';
import { markGuidePack } from './guide/guidePack';
import {
  NS_STEP_VERSES, NS_STEP_AI, NS_STEP_VALIDATE, NS_PROGRESS_CHARS,
  NS_ERR_VERSES_UNAVAILABLE, NS_ERR_VERSES_OUT_OF_RANGE, NS_ERR_NO_JSON, NS_ERR_OUTPUT_LIMIT,
} from './newStudyStrings';

export type ProgressReporter = (step: string, detail?: string) => void;

/** OpenRouter finish_reason when the reply hit max_tokens. */
export const FINISH_LENGTH = 'length';
/** Quota role on the hosted proxy + X-Title header for an own key (ASCII only). */
const PACK_REQUEST: AIRequestMeta = { role: 'pack', title: 'Scripture to Life - New study' };

/** The requested verses from the bundled chapter files, both translations required. */
export async function loadPassage(req: VerseRange): Promise<PackVerse[]> {
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

/** The data form (ADR-0014): the pack system message is server-owned (_shared/aiPrompts), added by the proxy or, own key, by aiTransport. */
export function buildPackRequestBody(req: StudyRequest, verses: PackVerse[]): string {
  return JSON.stringify({
    model: packGenerationModel(), // the #/setup choice, else the quality-first default (ADR-0003 → Models)
    stream: true,
    max_tokens: PACK_MAX_TOKENS,
    temperature: PACK_TEMPERATURE,
    messages: [
      {
        role: 'user',
        content: buildPackPrompt({
          passageRef: passageLabel(req).ref,
          verses,
          lessonTitle: req.lessonTitle,
          contentLanguage: req.contentLanguage,
        }),
      },
    ],
  });
}

/** The same request with the cut-off reply as the assistant turn and the continue instruction after it. */
export function buildContinuationBody(body: string, partial: string): string {
  const request = JSON.parse(body) as { messages: Array<{ role: string; content: string }> };
  return JSON.stringify({
    ...request,
    messages: [
      ...request.messages,
      { role: 'assistant', content: partial },
      { role: 'user', content: PACK_CONTINUE_PROMPT },
    ],
  });
}

function cancelled(): Error {
  return new DOMException('Generation cancelled', 'AbortError');
}

/** Both replies' text → the parsed object and its validated content. NS_ERR_NO_JSON names the served model when known. */
function parseGenerated(text: string, model: string | null, req: StudyRequest): { raw: Record<string, unknown>; content: GeneratedContent } {
  try {
    const raw = extractJsonObject(text);
    return { raw, content: validateGenerated(raw, req.contentLanguage) };
  } catch (err) {
    // Rethrown with context: the model id tells the owner which model produced the broken JSON.
    if ((err as Error).message === NS_ERR_NO_JSON && model) throw new Error(withModel(NS_ERR_NO_JSON, model));
    throw err;
  }
}

/** Stream the first reply and, on finish_reason "length", one continuation; the concatenated text plus the last outcome. */
async function streamPackReply(
  body: string,
  onProgress: ProgressReporter,
  signal: AbortSignal
): Promise<{ text: string; outcome: StreamOutcome; received: number }> {
  let received = 0;
  const onDelta = (delta: string) => {
    received += delta.length;
    onProgress(NS_STEP_AI, NS_PROGRESS_CHARS.replace(/\{n\}/g, String(received)));
  };
  const first = await streamChatCompletionDetailed(body, onDelta, signal, PACK_REQUEST);
  // The transport resolves with partial text on abort; that is a cancel, not a half-pack.
  if (signal.aborted) throw cancelled();
  if (first.finishReason !== FINISH_LENGTH) return { text: first.text, outcome: first, received };

  const second = await streamChatCompletionDetailed(buildContinuationBody(body, first.text), onDelta, signal, PACK_REQUEST);
  if (signal.aborted) throw cancelled();
  const outcome = { ...second, model: second.model ?? first.model };
  return { text: first.text + second.text, outcome, received };
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
  const { text, outcome, received } = await streamPackReply(requestBody(req, verses), onProgress, signal);
  if (outcome.finishReason === FINISH_LENGTH) {
    throw new Error(NS_ERR_OUTPUT_LIMIT.replace(/\{n\}/g, String(received)));
  }

  onProgress(NS_STEP_VALIDATE);
  const { raw, content } = parseGenerated(text, outcome.model, req);
  const pack = assemblePack(req, verses, content);
  return req.guide ? markGuidePack(pack, content, raw, req.guide.text, req.contentLanguage) : pack;
}

/** The passage path's body, or — with a study guide — the guide path's (ADR-0019). */
function requestBody(req: StudyRequest, verses: PackVerse[]): string {
  if (!req.guide) return buildPackRequestBody(req, verses);
  return buildGuideRequestBody({
    passageRef: passageLabel(req).ref, verses, contentLanguage: req.contentLanguage,
    guideText: req.guide.text, lessonTitle: req.lessonTitle,
  });
}
