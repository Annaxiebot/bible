/**
 * EditorActionBar.tsx — the editor's Preview, always in reach · 编辑器操作栏
 *
 * A generated pack is long; the leader should not scroll to the end to
 * present it. The bar is `position: sticky; bottom: 0` inside the page's
 * own scroll container (NewStudyPage): it stays on the bottom edge of the
 * screen while the editor is shown, and because it still takes its place in
 * the flow after the last section, it can never cover that section. The
 * bottom padding clears the iPhone home indicator (safe-area inset). The
 * status / error line lives here too, so edits always show their outcome.
 * One button only (owner, 2026-10-31): auto-save (flushed on Preview, Back
 * and unmount) made the explicit Save a redundant second control; the
 * 已自动保存 line is the save feedback. Back is a navigation step and sits
 * at the top of the editor instead.
 */
import React from 'react';
import { NS_PREVIEW } from './newStudyStrings';
import { textStyle, controlStyle, primaryButtonClass } from './newStudyStyles';

/** Space below the buttons; the home-indicator inset is added on top of it. */
const BAR_BOTTOM_PAD = 'calc(12px + env(safe-area-inset-bottom, 0px))';

export const actionBarStyle: React.CSSProperties = { paddingBottom: BAR_BOTTOM_PAD };

interface Props {
  invalid: boolean;
  error: string | null;
  status: string | null;
  onPreview: () => void;
}

const EditorActionBar: React.FC<Props> = ({ invalid, error, status, onPreview }) => (
  <div data-testid="ns-action-bar"
    className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-2 border-t border-stl-border bg-stl-surface px-4 pt-3 sm:-mx-6 sm:px-6"
    style={actionBarStyle}>
    {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      {status && (
        <p role="status" data-testid="ns-status" className="mr-auto text-emerald-300" style={textStyle}>{status}</p>
      )}
      <div className="ml-auto flex gap-3">
        <button type="button" onClick={onPreview} disabled={invalid} className={primaryButtonClass} style={controlStyle}
          data-testid="ns-preview">{NS_PREVIEW}</button>
      </div>
    </div>
  </div>
);

export default EditorActionBar;
