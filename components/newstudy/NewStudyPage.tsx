/**
 * NewStudyPage.tsx — "新建查经 New study" (#/new, #/new/<packId>) · 新建查经页
 *
 * Owns the phase state (PhaseView renders it) and "我的查经包 My packs";
 * a visitor with no saved packs first sees the three-step card (FirstTimeGuide).
 * AI gate (ADR-0007, components/setup/useAIAccess): a signed-in leader or
 * an own OpenRouter key → the form; neither → the AI form renders inline
 * first (sign-in prompt, own-key option below). The key never leaves
 * localStorage; nothing is logged.
 *
 * A pack is never lost: the editor's pack is auto-saved (useAutoSave) the
 * moment generation completes and after every edit; the URL follows it
 * ("#/new/<packId>", useEditorRoute) so a reload — or coming back from the
 * TV preview — reopens the same editor.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { StudyPack } from '../studypack/packTypes';
import { findLeaderPack, LOCAL_PACK_NOT_FOUND } from '../studypack/packSource';
import { rememberTvReturn } from '../studypack/tvReturn';
import { requestFullscreen, exitFullscreen } from '../studypack/fullscreen';
import { QuickAISetupForm } from '../setup/QuickAISetup';
import { useAIAccess } from '../setup/useAIAccess';
import { NEW_STUDY_HASH, newStudyHash, getNewStudyPackIdFromHash, packHash } from '../landing/landingRoute';
import PhaseView, { Phase } from './PhaseView';
import PackList from './PackList';
import FirstTimeGuide from './FirstTimeGuide';
import { useLocalPacks } from './useLocalPacks';
import { useNextStudy } from './useNextStudy';
import { useGeneration } from './useGeneration';
import { useAutoSave } from './useAutoSave';
import { NS_TITLE, NS_INTRO, NS_PRIVACY, NS_BACK, NS_ERR_STORAGE } from './newStudyStrings';
import { textStyle, controlStyle, quietButtonClass, pageTitleStyle } from './newStudyStyles';

/**
 * Keep the editor in step with the hash: "#/new/<id>" opens that stored
 * pack — this browser first, then the signed-in leader's account (ADR-0006) —
 * (reload, browser back/forward, the Edit link); a bare "#/new" while
 * editing closes the editor. A missing or unreadable pack is a visible error,
 * tagged with the id it is about (see RouteError).
 */
function useEditorRoute(
  currentId: string | null, open: (pack: StudyPack) => void, close: () => void,
  onError: (error: RouteError) => void,
): void {
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      const id = getNewStudyPackIdFromHash(window.location.hash);
      if (id === currentId) return;
      if (!id) { close(); return; }
      findLeaderPack(id)
        .then(pack => { if (!cancelled) (pack ? open(pack) : onError({ id, message: LOCAL_PACK_NOT_FOUND })); })
        .catch((err: unknown) => {
          if (!cancelled) onError({ id, message: `${NS_ERR_STORAGE}: ${err instanceof Error ? err.message : String(err)}` });
        });
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => { cancelled = true; window.removeEventListener('hashchange', sync); };
  }, [currentId, open, close, onError]);
}

/**
 * A failed "#/new/<id>" lookup. It names its id because a freshly generated
 * pack sets the hash before auto-save stores it: the lookup can answer "not
 * found" for the very pack the editor already shows. Such an error is not shown.
 */
interface RouteError { id: string; message: string }

const NewStudyPage: React.FC = () => {
  const access = useAIAccess();
  const configured = access.available;
  const [phase, setPhaseRaw] = useState<Phase>({ kind: 'form' });
  const [routeError, setRouteError] = useState<RouteError | null>(null);
  const packs = useLocalPacks();
  const suggestion = useNextStudy(packs.packs, packs.loaded);
  const editing = phase.kind === 'editor' ? phase.pack : null;
  const autosave = useAutoSave(editing, packs.save);

  // Generation and edits land here; the URL follows the pack so a reload reopens the editor.
  const setPhase = useCallback((next: Phase) => {
    setPhaseRaw(next);
    if (next.kind === 'editor') window.location.hash = newStudyHash(next.pack.id);
  }, []);
  const { generate, cancel } = useGeneration(setPhase);

  const { markClean, flush } = autosave;
  const openSaved = useCallback((pack: StudyPack) => {
    markClean(pack);
    setRouteError(null);
    setPhase({ kind: 'editor', pack });
  }, [markClean, setPhase]);
  const closeEditor = useCallback(() => {
    setPhaseRaw(current => (current.kind === 'editor' ? { kind: 'form' } : current));
  }, []);
  useEditorRoute(editing?.id ?? null, openSaved, closeEditor, setRouteError);

  /** Back: store any pending edit first; a failed save keeps the editor open with the error shown. */
  const back = async () => {
    await flush();
    closeEditor();
    window.location.hash = NEW_STUDY_HASH;
  };

  /** Full screen is requested first, inside the click (the gesture is gone after the await). */
  const preview = async (pack: StudyPack) => {
    requestFullscreen();
    try {
      await flush();
    } catch (err) {
      exitFullscreen(); // the editor stays, showing the save error
      throw err;
    }
    rememberTvReturn(pack.id, newStudyHash(pack.id));
    window.location.hash = packHash(pack.id);
  };

  return (
    <div data-testid="new-study-page" className="fixed inset-0 overflow-y-auto bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-bold text-amber-300" style={pageTitleStyle}>{NS_TITLE}</h1>
            <p className="mt-2 text-slate-400" style={textStyle}>{NS_INTRO}</p>
          </div>
          <a href="#" className={quietButtonClass} style={controlStyle} aria-label={NS_BACK}>✕</a>
        </header>
        <FirstTimeGuide show={phase.kind === 'form' && packs.loaded && packs.packs.length === 0} />
        {!configured && (
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <QuickAISetupForm onSaved={access.refresh} ownKeyOption={false} />
          </div>
        )}
        {routeError && routeError.id !== editing?.id && (
          <p role="alert" className="text-red-300" style={textStyle}>{routeError.message}</p>
        )}
        <PhaseView
          phase={phase} configured={configured}
          onGenerate={req => void generate(req)} onCancel={cancel}
          onBack={() => void back().catch(() => undefined /* shown by the editor via autosave.error */)}
          onChange={pack => setPhase({ kind: 'editor', pack })}
          onSave={flush} onPreview={preview}
          autosave={{ status: autosave.status, error: autosave.error }}
          suggestion={suggestion}
          onGuide={guide => setPhase(guide ? { kind: 'form', guide } : { kind: 'form' })}
        />
        {phase.kind === 'form' && <PackList packs={packs} onOpen={openSaved} />}
        <p className="text-slate-500" style={textStyle}>{NS_PRIVACY}</p>
      </div>
    </div>
  );
};

export default NewStudyPage;
