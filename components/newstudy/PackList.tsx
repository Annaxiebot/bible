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
import { PackListing } from '../shared/PackListing';
import { DateTile, StudyHeading, TrashButton, studyRowClass, goldButtonClass, outlineButtonClass } from '../shared/PackRowParts';

interface Props {
  packs: LocalPacks;
  onOpen: (pack: StudyPack) => void;
}

/** One study, design B: date tile · title + passage chip (opens it) · 编辑 Edit (gold) · 报名 Sign-ups · delete icon. */
const PackRow: React.FC<{ pack: StudyPack; packs: LocalPacks; onOpen: (pack: StudyPack) => void }> = ({ pack, packs, onOpen }) => {
  // A real link (#/new/<id>) so the editor URL survives reload; the click opens it in place.
  const open = (e: React.MouseEvent) => { e.preventDefault(); onOpen(pack); };
  return (
    <li data-testid="pack-row" className={studyRowClass}>
      <DateTile date={pack.date} />
      <a href={newStudyHash(pack.id)} onClick={open} className="flex min-w-0 flex-1"><StudyHeading pack={pack} /></a>
      <div className="flex items-center gap-2">
        <a href={newStudyHash(pack.id)} data-testid="pack-edit" onClick={open} className={goldButtonClass} style={controlStyle}>{NS_EDIT}</a>
        <a href={leaderHash(pack.id)} data-testid="pack-signups" className={outlineButtonClass} style={controlStyle}>{NS_SIGNUPS}</a>
        <TrashButton label={NS_DELETE} onClick={() => { if (window.confirm(NS_DELETE_CONFIRM)) void packs.remove(pack.id); }} />
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
