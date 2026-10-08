/**
 * PackList.tsx — "我的查经包 My packs" · 本地查经包列表
 *
 * Edit (the editor at #/new/<id>), sign-ups (the leader list at
 * #/leader/<id>), delete (with a bilingual confirm), and one quiet
 * "备份与恢复 · Backup & restore" link (BackupPanel). Storage errors and the
 * account sync line render inline.
 */
import React, { useState } from 'react';
import { StudyPack } from '../studypack/packTypes';
import { LocalPacks } from './useLocalPacks';
import { PackSyncLine } from './PackSyncLine';
import { leaderHash } from '../leader/leaderRoute';
import { newStudyHash } from '../landing/landingRoute';
import {
  NS_MY_PACKS, NS_NO_PACKS, NS_EDIT, NS_DELETE, NS_SHOW_ALL, NS_SHOW_FEWER, NS_DELETE_CONFIRM, NS_INVALID_RECORDS, NS_SIGNUPS,
} from './newStudyStrings';
import { textStyle, controlStyle, headingStyle } from './newStudyStyles';
import BackupPanel from './BackupPanel';

interface Props {
  packs: LocalPacks;
  onOpen: (pack: StudyPack) => void;
}

/** The quiet text-link look of a row's actions. */
const rowLinkClass = 'inline-flex items-center px-2 text-slate-400 underline underline-offset-4 hover:text-slate-100';

/** "约翰福音 4:27–42 · 2026-10-05", leaving out the passage when the title already names it. */
export function packMetaLine(pack: Pick<StudyPack, 'title' | 'passageRef' | 'date'>): string {
  const zhRef = pack.passageRef.split(' · ')[0];
  return pack.title.includes(zhRef) ? pack.date : `${pack.passageRef} · ${pack.date}`;
}

/** Newest first: study date, then last save. */
export function newestFirst(packs: readonly StudyPack[]): StudyPack[] {
  const key = (p: StudyPack) => `${p.date} ${p.updatedAt ?? ''}`;
  return [...packs].sort((x, y) => (key(y) > key(x) ? 1 : key(y) < key(x) ? -1 : 0));
}

/** One compact line per study: the title opens it; Edit · Sign-ups · Delete are quiet links. */
const PackRow: React.FC<{ pack: StudyPack; packs: LocalPacks; onOpen: (pack: StudyPack) => void }> = ({ pack, packs, onOpen }) => {
  // A real link (#/new/<id>) so the editor URL survives reload; the click opens it in place.
  const open = (e: React.MouseEvent) => { e.preventDefault(); onOpen(pack); };
  return (
    <li data-testid="pack-row" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-800 py-3">
      <a href={newStudyHash(pack.id)} onClick={open} className="flex min-w-0 flex-col hover:text-amber-200">
        <span className="truncate text-slate-100" style={textStyle}>{pack.title}</span>
        <span className="text-slate-500" style={{ ...textStyle, fontSize: Number(textStyle.fontSize) * 0.85 }}>{packMetaLine(pack)}</span>
      </a>
      <div className="flex items-center">
        <a href={newStudyHash(pack.id)} data-testid="pack-edit" onClick={open} className={rowLinkClass} style={controlStyle}>{NS_EDIT}</a>
        <a href={leaderHash(pack.id)} data-testid="pack-signups" className={rowLinkClass} style={controlStyle}>{NS_SIGNUPS}</a>
        <button type="button" onClick={() => { if (window.confirm(NS_DELETE_CONFIRM)) void packs.remove(pack.id); }}
          className={rowLinkClass} style={controlStyle}>{NS_DELETE}</button>
      </div>
    </li>
  );
};

/** How many studies show before "显示全部 · Show all". */
export const PACK_LIST_PREVIEW = 5;

const PackList: React.FC<Props> = ({ packs, onOpen }) => {
  const [showAll, setShowAll] = useState(false);
  const sorted = newestFirst(packs.packs);
  return (
    <section data-testid="pack-list" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-amber-300" style={headingStyle}>{NS_MY_PACKS}</h2>
      </div>
      {packs.error && <p role="alert" className="text-red-300" style={textStyle}>{packs.error}</p>}
      <PackSyncLine />
      {packs.invalid.length > 0 && (
        <p role="alert" className="text-red-300" style={textStyle}>{NS_INVALID_RECORDS}: {packs.invalid.join(', ')}</p>
      )}
      {packs.packs.length === 0
        ? <p className="text-slate-500" style={textStyle}>{NS_NO_PACKS}</p>
        : (
          <>
            <ul className="flex flex-col border-t border-slate-800">
              {(showAll ? sorted : sorted.slice(0, PACK_LIST_PREVIEW)).map(p => <PackRow key={p.id} pack={p} packs={packs} onOpen={onOpen} />)}
            </ul>
            {sorted.length > PACK_LIST_PREVIEW && (
              <button type="button" onClick={() => setShowAll(v => !v)} data-testid="pack-show-all"
                className="self-start text-slate-400 underline underline-offset-4 hover:text-slate-100" style={controlStyle}>
                {showAll ? NS_SHOW_FEWER : NS_SHOW_ALL(sorted.length)}
              </button>
            )}
          </>
        )}
      <BackupPanel packs={packs} />
    </section>
  );
};

export default PackList;
