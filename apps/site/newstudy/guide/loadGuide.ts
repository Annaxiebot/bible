/**
 * loadGuide.ts — a picked PDF → the guide the New-study form opens with · 载入讲义 (ADR-0019 §1–2)
 *
 * Text from the PDF (in the browser), then the passage it studies. The
 * result rides on the form phase and, on Generate, on the StudyRequest.
 */
import { readGuidePdf, type GuideFile, type GuideText, type PdfOpener } from './guidePdf';
import { detectGuidePassage, type GuidePassage } from './guidePassage';

export interface LoadedGuide extends GuideText {
  passage: GuidePassage;
}

/** Throws the reader's bilingual errors unchanged. */
export async function loadGuide(file: GuideFile, open: PdfOpener): Promise<LoadedGuide> {
  const guide = await readGuidePdf(file, open);
  return { ...guide, passage: detectGuidePassage(guide.text) };
}
