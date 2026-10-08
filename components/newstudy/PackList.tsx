/**
 * PackList.tsx — "我的查经包 My packs" · 本地查经包列表
 *
 * Edit (the editor at #/new/<id>), sign-ups (the leader list at
 * #/leader/<id>), delete (with a bilingual confirm), and one quiet
 * "备份与恢复 · Backup & restore" link (BackupPanel). Storage errors and the
 * account sync line render inline.
 */
import React from 'react';
import { StudyPack } from '../studypack/packTypes';
import { LocalPacks } from './useLocalPacks';
import { PackSyncLine } from './PackSyncLine';
import { leaderHash } from '../leader/leaderRoute';
import { newStudyHash } from '../landing/landingRoute';
import {
  NS_MY_PACKS, NS_NO_PACKS, NS_EDIT, NS_DELETE, NS_DELETE_CONFIRM, NS_INVALID_RECORDS, NS_SIGNUPS,
} from './newStudyStrings';
import { textStyle, controlStyle, headingStyle } from './newStudyStyles';
import BackupPanel from './BackupPanel';
import { PackListing, packMetaLine } from '../shared/PackListing';

interface Props {
  packs: LocalPacks;
  onOpen: (pack: StudyPack) => void;
}

/** The quiet text-link look of a row's actions. */
const rowLinkClass = 'inline-flex items-center px-2 text-slate-400 underline underline-offset-4 hover:text-slate-100';

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

const PackList: React.FC<Props> = ({ packs, onOpen }) => {
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
          <PackListing packs={packs.packs} renderRow={p => <PackRow key={p.id} pack={p} packs={packs} onOpen={onOpen} />} />
        )}
      <BackupPanel packs={packs} />
    </section>
  );
};

export default PackList;
