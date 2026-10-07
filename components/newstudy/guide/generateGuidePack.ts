/**
 * generateGuidePack.ts — a study-guide PDF → validated StudyPack, automatically · 讲义生成 (ADR-0019 + amendment)
 *
 * Picking the PDF starts this (guideStudyRequest: today, the remembered content
 * language). The passage:
 * - the guide's heading named it clearly (guidePassage, the rule-based fast
 *   path) → its bundled verses go into the request, as on the passage path;
 * - otherwise (findPassage) → the request carries no passage, and the reply's
 *   "passage" (guideAIPassage) decides it once the reply is in: verses are
 *   then loaded from the bundled 和合本 + BSB and the pack assembled;
 * - neither → GuidePassageNotFound: the page reopens the form with the guide
 *   so the leader picks the passage (useGeneration).
 * The AI's reading is stored on the pack (guidePassage) so the editor can say
 * when it differs from the passage used. The AI never supplies verse text.
 * Streaming, the one continuation and JSON validation are the passage path's own.
 */
import { parseStudyPack, type StudyPack } from '../../studypack/packTypes';
import type { ContentLanguage } from '../../studypack/principles';
import { loadPassage, streamPackReply, parseGenerated, cancelled, FINISH_LENGTH, type ProgressReporter } from '../generatePack';
import { assemblePack, passageLabel, type StudyRequest } from '../packAssembly';
import { FIRST_STUDY } from '../nextStudy';
import { NS_STEP_VERSES, NS_STEP_AI, NS_STEP_VALIDATE, NS_ERR_OUTPUT_LIMIT } from '../newStudyStrings';
import { buildGuideRequestBody } from './guidePrompt';
import { markGuidePack } from './guidePack';
import { readAIPassage, type AIPassage } from './guideAIPassage';
import { GD_ERR_NO_PASSAGE } from './guideStrings';
import type { LoadedGuide } from './loadGuide';

/** Neither the guide's heading nor the AI's reply gave a usable passage. */
export class GuidePassageNotFound extends Error {
  constructor() {
    super(GD_ERR_NO_PASSAGE);
    this.name = 'GuidePassageNotFound';
  }
}

/** The request a picked guide starts: its clear passage, or a placeholder range and findPassage. */
export function guideStudyRequest(guide: LoadedGuide, date: string, contentLanguage: ContentLanguage): StudyRequest {
  const { range, confident } = guide.passage;
  return { ...(range ?? FIRST_STUDY), date, contentLanguage, guide, ...(confident ? {} : { findPassage: true }) };
}

/** The AI's passage; on the known-passage path a failure to load it only means "nothing to compare". */
async function aiReading(raw: Record<string, unknown>, known: AIPassage | null): Promise<AIPassage | null> {
  if (!known) return readAIPassage(raw);
  // Deliberately quiet: the leader's pack uses the guide's own heading passage; the AI's reading only feeds the notice.
  return readAIPassage(raw).catch(() => null);
}

export async function generateGuidePack(req: StudyRequest, onProgress: ProgressReporter, signal: AbortSignal): Promise<StudyPack> {
  const guide = req.guide;
  if (!guide) throw new Error('generateGuidePack needs a study guide');
  let known: AIPassage | null = null;
  if (!req.findPassage) {
    onProgress(NS_STEP_VERSES);
    known = { range: { bookId: req.bookId, chapter: req.chapter, verseFrom: req.verseFrom, verseTo: req.verseTo }, verses: await loadPassage(req) };
    if (signal.aborted) throw cancelled();
  }

  onProgress(NS_STEP_AI);
  const body = buildGuideRequestBody({
    passage: known ? { ref: passageLabel(known.range).ref, verses: known.verses } : undefined,
    contentLanguage: req.contentLanguage, guideText: guide.text, lessonTitle: req.lessonTitle,
  });
  const { text, outcome, received } = await streamPackReply(body, onProgress, signal);
  if (outcome.finishReason === FINISH_LENGTH) throw new Error(NS_ERR_OUTPUT_LIMIT.replace(/\{n\}/g, String(received)));

  onProgress(NS_STEP_VALIDATE);
  const { raw, content } = parseGenerated(text, outcome.model, req);
  const read = await aiReading(raw, known);
  if (signal.aborted) throw cancelled();
  const used = known ?? read;
  if (!used) throw new GuidePassageNotFound();
  const pack = assemblePack({ ...req, ...used.range }, used.verses, content);
  const marked = markGuidePack(pack, content, raw, guide.text, req.contentLanguage);
  return read ? parseStudyPack({ ...marked, guidePassage: read.range }) : marked;
}
