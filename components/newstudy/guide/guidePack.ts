/**
 * guidePack.ts — mark where a study-guide pack's sections came from · 标注讲义来源 (ADR-0019 §4–5)
 *
 * After the normal validation and assembly, every model-filled section gets
 * `origin`: 'guide' for a section the reply lists in "fromGuide" (only the
 * GUIDE_SECTION_KINDS count) — or one that holds any word-for-word guide
 * line although the reply did not list it, so the check still runs on it —
 * else 'ai'. A guide section's lines that are not word for word in the guide
 * go into `notVerbatim`, exactly as the editor shows them (contentLine), so
 * the editor can flag them until the leader edits them. Any model-filled
 * line that matches one of the guide's answer bullets (guideAnswers.ts) goes
 * into `leaderAnswer` the same way (ADR-0019 amendment).
 */
import type { PackSection, StudyPack } from '../../studypack/packTypes';
import { contentLine, type ContentLanguage } from '../../studypack/principles';
import { GUIDE_SECTION_KINDS, type GuideSectionKind } from '../../../supabase/functions/_shared/aiPrompts';
import type { Bilingual, GeneratedContent } from '../generatedPack';
import { guideMatcher, itemIsVerbatim } from './guideVerbatim';
import { answerMatcher, lineLooksLikeAnswer } from './guideAnswers';

/** Sections the model fills (the title, scripture and QR are the app's facts and carry no origin). */
const MODEL_FILLED_KINDS: ReadonlySet<string> = new Set([
  'context', 'originalLanguage', 'crossRefs', 'discussion', 'lifeMenu', 'reflection', 'closing',
]);

function isGuideKind(kind: string): kind is GuideSectionKind {
  return (GUIDE_SECTION_KINDS as readonly string[]).includes(kind);
}

/** The reply's "fromGuide", kept to the kinds a guide may fill; anything else is ignored. */
export function guideKindsOf(raw: Record<string, unknown>): GuideSectionKind[] {
  const listed = Array.isArray(raw.fromGuide) ? raw.fromGuide : [];
  return GUIDE_SECTION_KINDS.filter(kind => listed.includes(kind));
}

interface GuideCheck { origin: 'guide' | 'ai'; notVerbatim: string[] }

function checkSection(items: Bilingual[], listed: boolean, isVerbatim: (line: string) => boolean, mode: ContentLanguage): GuideCheck {
  const verbatim = items.map(item => itemIsVerbatim(item, isVerbatim));
  if (!listed && !verbatim.some(Boolean)) return { origin: 'ai', notVerbatim: [] };
  const notVerbatim = items.filter((_, i) => !verbatim[i]).map(item => contentLine(mode, item.zh, item.en));
  return { origin: 'guide', notVerbatim };
}

/** The pack with every model-filled section's origin and each guide section's non-verbatim lines. */
export function markGuidePack(
  pack: StudyPack, gen: GeneratedContent, raw: Record<string, unknown>, guideText: string, mode: ContentLanguage,
): StudyPack {
  const listed = guideKindsOf(raw);
  const isVerbatim = guideMatcher(guideText);
  const isAnswer = answerMatcher(guideText);
  const sections = pack.sections.map((section): PackSection => {
    if (!MODEL_FILLED_KINDS.has(section.kind)) return section;
    const answers = shownLines(section).filter(line => lineLooksLikeAnswer(line, isAnswer));
    const flagged = answers.length > 0 ? { leaderAnswer: answers } : {};
    if (!isGuideKind(section.kind)) return { ...section, origin: 'ai', ...flagged };
    const check = checkSection(gen[section.kind], listed.includes(section.kind), isVerbatim, mode);
    return check.origin === 'ai'
      ? { ...section, origin: 'ai', ...flagged }
      : { ...section, origin: 'guide', notVerbatim: check.notVerbatim, ...flagged };
  });
  return { ...pack, sections };
}

/** The lines a section shows in the editor: its questions, body lines or life-menu practices. */
function shownLines(section: PackSection): string[] {
  return section.questions ?? section.body ?? section.rows?.map(row => row.practice) ?? [];
}

/** The flagged lines a section still shows (an edited line is the leader's own and loses its flag). */
export function stillNotVerbatim(section: PackSection): string[] {
  const shown = shownLines(section);
  return (section.notVerbatim ?? []).filter(line => shown.includes(line));
}

/** The lines still shown that look like the guide's leader-only answers (cleared the same way). */
export function stillLeaderAnswers(section: PackSection): string[] {
  const shown = shownLines(section);
  return (section.leaderAnswer ?? []).filter(line => shown.includes(line));
}
