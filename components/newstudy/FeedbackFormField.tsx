/**
 * FeedbackFormField.tsx — optional Google Form for feedback · Google 表单（可选）
 *
 * One URL input plus the two prefill entry ids (name, practice). Empty URL
 * = the built-in #/checkin page (the default, no setup). While empty, the
 * opt-in button "连接 Google 表单 Connect Google Forms" (useFeedbackForm's
 * `connect`) creates a form in the leader's own Google account. The pack
 * keeps the values through packEdits.withFeedbackForm; validation is
 * validateEdited's. Google Forms prefill format:
 * <form>/viewform?entry.<id>=<value> (ADR-0004 §9).
 */
import React from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { withFeedbackForm } from './packEdits';
import { NS_FEEDBACK_FORM, NS_FEEDBACK_FORM_HINT, NS_FORM_CONNECT } from './newStudyStrings';
import { textStyle, controlStyle, inputClass, labelClass, secondaryButtonClass } from './newStudyStyles';

/** Labels for the two prefill ids; the leader copies them from the form's "Get pre-filled link". */
export const NS_ENTRY_NAME = '姓名 entry id (name)';
export const NS_ENTRY_PRACTICE = '操练 entry id (practice)';

interface Props {
  pack: StudyPack;
  onEdit: (pack: StudyPack) => void;
  /** The Google Forms opt-in; absent when there is nothing to sign in to. */
  onConnect?: (() => void) | null;
  connecting?: boolean;
}

const FeedbackFormField: React.FC<Props> = ({ pack, onEdit, onConnect, connecting }) => {
  const url = pack.feedbackFormUrl ?? '';
  const entries = { name: pack.feedbackFormEntries?.name ?? '', practice: pack.feedbackFormEntries?.practice ?? '' };
  const set = (patch: { url?: string; name?: string; practice?: string }) =>
    onEdit(withFeedbackForm(pack, patch.url ?? url, { name: patch.name ?? entries.name, practice: patch.practice ?? entries.practice }));
  return (
    <div data-testid="ns-feedback-form" className="flex flex-col gap-3">
      <label className={labelClass} style={textStyle}>
        <span>{NS_FEEDBACK_FORM}</span>
        <input type="url" inputMode="url" value={url} aria-label={NS_FEEDBACK_FORM} data-testid="ns-feedback-url"
          placeholder="https://docs.google.com/forms/d/e/…/viewform"
          onChange={e => set({ url: e.target.value })} className={inputClass} style={controlStyle} />
        <span className="text-slate-500">{NS_FEEDBACK_FORM_HINT}</span>
      </label>
      {!url && onConnect && (
        <button type="button" onClick={onConnect} disabled={connecting === true} data-testid="ns-form-connect"
          className={`${secondaryButtonClass} self-start`} style={controlStyle}>{NS_FORM_CONNECT}</button>
      )}
      {url && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass} style={textStyle}>
            <span>{NS_ENTRY_NAME}</span>
            <input type="text" value={entries.name} aria-label={NS_ENTRY_NAME} data-testid="ns-feedback-entry-name"
              placeholder="entry.123456" onChange={e => set({ name: e.target.value })} className={inputClass} style={controlStyle} />
          </label>
          <label className={labelClass} style={textStyle}>
            <span>{NS_ENTRY_PRACTICE}</span>
            <input type="text" value={entries.practice} aria-label={NS_ENTRY_PRACTICE} data-testid="ns-feedback-entry-practice"
              placeholder="entry.654321" onChange={e => set({ practice: e.target.value })} className={inputClass} style={controlStyle} />
          </label>
        </div>
      )}
    </div>
  );
};

export default FeedbackFormField;
