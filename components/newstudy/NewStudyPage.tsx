/**
 * NewStudyPage.tsx — "新建查经 New study" (#/new) · 新建查经页
 *
 * Owns the phase state (PhaseView renders it) and "我的查经包 My packs".
 * With no OpenRouter key the quick setup form renders inline first (reused
 * from components/setup). Packs stay in this browser's IndexedDB; the key
 * never leaves localStorage; nothing is logged.
 */
import React, { useState } from 'react';
import { StudyPack } from '../studypack/packTypes';
import { getApiKey } from '../../services/openrouter';
import { QuickAISetupForm } from '../setup/QuickAISetup';
import PhaseView, { Phase } from './PhaseView';
import PackList from './PackList';
import { useLocalPacks } from './useLocalPacks';
import { useGeneration } from './useGeneration';
import { NS_TITLE, NS_INTRO, NS_PRIVACY, NS_BACK } from './newStudyStrings';
import { textStyle, controlStyle, quietButtonClass, pageTitleStyle } from './newStudyStyles';

const NewStudyPage: React.FC = () => {
  const [configured, setConfigured] = useState(() => !!getApiKey());
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const { generate, cancel } = useGeneration(setPhase);
  const packs = useLocalPacks();

  const preview = async (pack: StudyPack) => {
    await packs.save(pack);
    window.location.hash = `#/pack/${pack.id}`;
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
        {!configured && (
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <QuickAISetupForm onSaved={() => setConfigured(true)} />
          </div>
        )}
        <PhaseView
          phase={phase} configured={configured}
          onGenerate={req => void generate(req)} onCancel={cancel}
          onBack={() => setPhase({ kind: 'form' })} onChange={pack => setPhase({ kind: 'editor', pack })}
          onSave={pack => packs.save(pack)} onPreview={preview}
        />
        {phase.kind === 'form' && <PackList packs={packs} onOpen={pack => setPhase({ kind: 'editor', pack })} />}
        <p className="text-slate-500" style={textStyle}>{NS_PRIVACY}</p>
      </div>
    </div>
  );
};

export default NewStudyPage;
