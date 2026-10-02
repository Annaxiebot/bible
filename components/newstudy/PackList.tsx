/**
 * PackList.tsx — "我的查经包 My packs" · 本地查经包列表
 *
 * Open (into the editor), export JSON (download), sign-ups (the leader list
 * at #/leader/<id>), delete (with a bilingual confirm), import JSON (file
 * picker). Storage errors render inline.
 */
import React, { useRef } from 'react';
import { StudyPack } from '../studypack/packTypes';
import { LocalPacks } from './useLocalPacks';
import { leaderHash } from '../leader/leaderRoute';
import {
  NS_MY_PACKS, NS_NO_PACKS, NS_OPEN, NS_EXPORT, NS_IMPORT, NS_DELETE, NS_DELETE_CONFIRM, NS_INVALID_RECORDS, NS_SIGNUPS,
} from './newStudyStrings';
import { textStyle, controlStyle, headingStyle, secondaryButtonClass, quietButtonClass } from './newStudyStyles';

interface Props {
  packs: LocalPacks;
  onOpen: (pack: StudyPack) => void;
}

const PackRow: React.FC<{ pack: StudyPack; packs: LocalPacks; onOpen: (pack: StudyPack) => void }> = ({ pack, packs, onOpen }) => (
  <li data-testid="pack-row" className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
    <span className="text-slate-100" style={textStyle}>{pack.title}</span>
    <span className="text-slate-500" style={textStyle}>{pack.passageRef} · {pack.date}</span>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onOpen(pack)} className={secondaryButtonClass} style={controlStyle}>
        {NS_OPEN}
      </button>
      <button type="button" onClick={() => packs.exportJson(pack)} className={secondaryButtonClass} style={controlStyle}>
        {NS_EXPORT}
      </button>
      <a href={leaderHash(pack.id)} data-testid="pack-signups" className={`${secondaryButtonClass} inline-flex items-center`} style={controlStyle}>
        {NS_SIGNUPS}
      </a>
      <button
        type="button"
        onClick={() => { if (window.confirm(NS_DELETE_CONFIRM)) void packs.remove(pack.id); }}
        className={quietButtonClass} style={controlStyle}
      >
        {NS_DELETE}
      </button>
    </div>
  </li>
);

const PackList: React.FC<Props> = ({ packs, onOpen }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section data-testid="pack-list" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-amber-300" style={headingStyle}>{NS_MY_PACKS}</h2>
        <button type="button" onClick={() => fileRef.current?.click()} className={secondaryButtonClass} style={controlStyle}>
          {NS_IMPORT}
        </button>
        <input
          ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="ns-import-file"
          aria-label={NS_IMPORT}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void packs.importJson(file);
            e.target.value = '';
          }}
        />
      </div>
      {packs.error && <p role="alert" className="text-red-300" style={textStyle}>{packs.error}</p>}
      {packs.invalid.length > 0 && (
        <p role="alert" className="text-red-300" style={textStyle}>{NS_INVALID_RECORDS}: {packs.invalid.join(', ')}</p>
      )}
      {packs.packs.length === 0
        ? <p className="text-slate-500" style={textStyle}>{NS_NO_PACKS}</p>
        : (
          <ul className="flex flex-col gap-3">
            {packs.packs.map(p => <PackRow key={p.id} pack={p} packs={packs} onOpen={onOpen} />)}
          </ul>
        )}
    </section>
  );
};

export default PackList;
