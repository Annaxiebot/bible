/**
 * GuideEntry.tsx — "从讲义 PDF 生成 · From a study-guide PDF" · 讲义入口 (ADR-0019 §1–2)
 *
 * GuideEntry: one quiet text button under the New-study form; it opens the
 * file picker (PDF only), reads the guide in the browser and hands it up.
 * Errors show inline, bilingual; the form stays as it was.
 * GuideBanner: above the form once a guide is read — its name and pages,
 * where the passage came from (or that the leader must choose), the privacy
 * line, and "不用讲义 · Without the guide". Large type, ≥48px targets.
 */
import React, { useRef, useState } from 'react';
import { loadGuide, type LoadedGuide } from './loadGuide';
import type { PdfOpener } from './guidePdf';
import { openWithPdfjs } from './pdfjsLoader';
import { passageLabel } from '../packAssembly';
import { GD_PICK, GD_READING, GD_LOADED, GD_DROP, GD_PASSAGE_FOUND, GD_PASSAGE_UNSURE, GD_PRIVACY } from './guideStrings';
import { textStyle, controlStyle, quietButtonClass } from '../newStudyStyles';

interface EntryProps {
  onGuide: (guide: LoadedGuide) => void;
  /** pdfjs by default; tests pass their own. */
  open?: PdfOpener;
}

export const GuideEntry: React.FC<EntryProps> = ({ onGuide, open = openWithPdfjs }) => {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setError(null);
    try {
      onGuide(await loadGuide(file, open));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err)); // shown below the button
    } finally {
      setReading(false);
      if (input.current) input.current.value = ''; // the same file can be picked again
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="ns-guide-entry">
      <button type="button" onClick={() => input.current?.click()} disabled={reading}
        className={`${quietButtonClass} self-start underline underline-offset-4`} style={controlStyle} data-testid="ns-guide-pick">
        {reading ? GD_READING : GD_PICK}
      </button>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden data-testid="ns-guide-file"
        onChange={e => void pick(e.target.files?.[0])} />
      {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
    </div>
  );
};

/** The line under the guide's name: the passage it names, or a request to choose. */
export function passageHint(guide: LoadedGuide): string {
  const { range, confident } = guide.passage;
  return range && confident ? GD_PASSAGE_FOUND.replace(/\{ref\}/g, passageLabel(range).ref) : GD_PASSAGE_UNSURE;
}

export const GuideBanner: React.FC<{ guide: LoadedGuide; onDrop: () => void }> = ({ guide, onDrop }) => (
  <div data-testid="ns-guide-banner" className="flex flex-col gap-2 rounded-lg border border-amber-400/40 p-4">
    <div className="flex items-start justify-between gap-3">
      <p className="text-amber-300" style={textStyle}>
        {GD_LOADED.replace(/\{name\}/g, guide.name).replace(/\{n\}/g, String(guide.pages))}
      </p>
      <button type="button" onClick={onDrop} className={`${quietButtonClass} shrink-0`} style={controlStyle} data-testid="ns-guide-drop">
        {GD_DROP}
      </button>
    </div>
    <p className="text-slate-300" style={textStyle} data-testid="ns-guide-passage">{passageHint(guide)}</p>
    <p className="text-slate-500" style={textStyle}>{GD_PRIVACY}</p>
  </div>
);
