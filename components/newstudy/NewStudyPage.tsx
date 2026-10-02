/**
 * NewStudyPage.tsx — "新建查经 New study" (#/new) · 新建查经页
 *
 * form → generating (streamed progress) → editor; "我的查经包 My packs" sits
 * under the form. With no OpenRouter key the quick setup form renders inline
 * first (reused from components/setup). Packs stay in this browser's
 * IndexedDB; the key never leaves localStorage; nothing is logged.
 */
import React, { useState, useRef, useCallback } from 'react';
import { StudyPack } from '../studypack/packTypes';
import { getApiKey } from '../../services/openrouter';
import { QuickAISetupForm } from '../setup/QuickAISetup';
import NewStudyForm from './NewStudyForm';
import NewStudyEditor from './NewStudyEditor';
import PackList from './PackList';
import { useLocalPacks } from './useLocalPacks';
import { generateStudyPack } from './generatePack';
import { StudyRequest } from './packAssembly';
import { NS_TITLE, NS_INTRO, NS_PRIVACY, NS_CANCEL, NS_RETRY, NS_BACK } from './newStudyStrings';
import { textStyle, controlStyle, headingStyle, secondaryButtonClass, quietButtonClass } from './newStudyStyles';

type Phase =
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

const NewStudyPage: React.FC = () => {
  const [configured, setConfigured] = useState(() => !!getApiKey());
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const abortRef = useRef<AbortController | null>(null);
  const packs = useLocalPacks();

  const generate = useCallback(async (req: StudyRequest) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'generating', req, step: '', detail: '' });
    try {
      const pack = await generateStudyPack(
        req,
        (step, detail = '') => setPhase({ kind: 'generating', req, step, detail }),
        controller.signal
      );
      setPhase({ kind: 'editor', pack });
    } catch (err) {
      // A cancel (Escape/Cancel button) is the leader's own choice: back to the form, no error.
      if ((err as Error).name === 'AbortError') { setPhase({ kind: 'form' }); return; }
      setPhase({ kind: 'failed', req, message: (err as Error).message });
    }
  }, []);

  const cancel = () => abortRef.current?.abort();
  const save = async (pack: StudyPack) => { await packs.save(pack); };
  const preview = async (pack: StudyPack) => {
    await packs.save(pack);
    window.location.hash = `#/pack/${pack.id}`;
  };

  return (
    <div data-testid="new-study-page" className="fixed inset-0 overflow-y-auto bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-bold text-amber-300" style={{ fontSize: 'clamp(1.75rem, 1.4rem + 1.2vw, 2.25rem)' }}>{NS_TITLE}</h1>
            <p className="mt-2 text-slate-400" style={textStyle}>{NS_INTRO}</p>
          </div>
          <a href="#" className={quietButtonClass} style={controlStyle} aria-label={NS_BACK}>✕</a>
        </header>

        {!configured && (
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <QuickAISetupForm onSaved={() => setConfigured(true)} />
          </div>
        )}

        {phase.kind === 'form' && configured && <NewStudyForm busy={false} onGenerate={req => void generate(req)} />}
        {phase.kind === 'generating' && <Progress step={phase.step} detail={phase.detail} onCancel={cancel} />}
        {phase.kind === 'failed' && (
          <Failed message={phase.message} onRetry={() => void generate(phase.req)} onBack={() => setPhase({ kind: 'form' })} />
        )}
        {phase.kind === 'editor' && (
          <NewStudyEditor
            pack={phase.pack}
            onChange={pack => setPhase({ kind: 'editor', pack })}
            onSave={save}
            onPreview={preview}
            onBack={() => setPhase({ kind: 'form' })}
          />
        )}

        {phase.kind === 'form' && <PackList packs={packs} onOpen={pack => setPhase({ kind: 'editor', pack })} />}
        <p className="text-slate-500" style={textStyle}>{NS_PRIVACY}</p>
      </div>
    </div>
  );
};

export default NewStudyPage;
