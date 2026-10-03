/**
 * PhaseView.tsx — what the New-study page shows for its current phase · 阶段视图
 *
 * form → generating (streamed progress + Cancel) → failed (bilingual error +
 * Retry) → editor. The form is hidden until AI is available — signed in or
 * an own key (NewStudyPage renders the AI form above). State lives in NewStudyPage.
 */
import React from 'react';
import { StudyPack } from '../studypack/packTypes';
import NewStudyForm from './NewStudyForm';
import NewStudyEditor from './NewStudyEditor';
import { StudyRequest } from './packAssembly';
import type { AutoSaveStatus } from './useAutoSave';
import type { FeedbackFormState } from './useFeedbackForm';
import { NS_CANCEL, NS_RETRY, NS_BACK } from './newStudyStrings';
import { textStyle, controlStyle, headingStyle, secondaryButtonClass, quietButtonClass } from './newStudyStyles';

export type Phase =
  | { kind: 'form' }
  | { kind: 'generating'; req: StudyRequest; step: string; detail: string }
  | { kind: 'failed'; req: StudyRequest; message: string }
  | { kind: 'editor'; pack: StudyPack };

/** Streamed progress while the model drafts (the leader sees it working). */
const Progress: React.FC<{ step: string; detail: string; onCancel: () => void }> = ({ step, detail, onCancel }) => (
  <div data-testid="ns-progress" className="flex flex-col gap-4" aria-live="polite">
    <p className="text-amber-300" style={headingStyle}>{step}</p>
    {detail && <p className="text-slate-400" style={textStyle}>{detail}</p>}
    <button type="button" onClick={onCancel} className={`${quietButtonClass} self-start`} style={controlStyle}>{NS_CANCEL}</button>
  </div>
);

const Failed: React.FC<{ message: string; onRetry: () => void; onBack: () => void }> = ({ message, onRetry, onBack }) => (
  <div data-testid="ns-failed" className="flex flex-col gap-4">
    <p role="alert" className="text-red-300" style={textStyle}>{message}</p>
    <div className="flex gap-3">
      <button type="button" onClick={onBack} className={quietButtonClass} style={controlStyle}>{NS_BACK}</button>
      <button type="button" onClick={onRetry} className={secondaryButtonClass} style={controlStyle} data-testid="ns-retry">{NS_RETRY}</button>
    </div>
  </div>
);

export interface PhaseViewProps {
  phase: Phase;
  configured: boolean;
  onGenerate: (req: StudyRequest) => void;
  onCancel: () => void;
  onBack: () => void;
  onChange: (pack: StudyPack) => void;
  onSave: (pack: StudyPack) => Promise<void>;
  onPreview: (pack: StudyPack) => Promise<void>;
  autosave: { status: AutoSaveStatus; error: string | null };
  /** The Google Forms opt-in (useFeedbackForm). */
  form: FeedbackFormState;
}

const PhaseView: React.FC<PhaseViewProps> = ({
  phase, configured, onGenerate, onCancel, onBack, onChange, onSave, onPreview, autosave, form,
}) => {
  switch (phase.kind) {
    case 'form':
      return configured ? <NewStudyForm busy={false} onGenerate={onGenerate} /> : null;
    case 'generating':
      return <Progress step={phase.step} detail={phase.detail} onCancel={onCancel} />;
    case 'failed':
      return <Failed message={phase.message} onRetry={() => onGenerate(phase.req)} onBack={onBack} />;
    case 'editor':
      return (
        <NewStudyEditor pack={phase.pack} onChange={onChange} onSave={onSave} onPreview={onPreview} onBack={onBack}
          autosave={autosave} form={form} />
      );
  }
};

export default PhaseView;
