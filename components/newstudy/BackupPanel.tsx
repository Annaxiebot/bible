/**
 * BackupPanel.tsx — "备份与恢复 · Backup & restore" under My packs · 备份与恢复
 *
 * Owner decision: download/restore is an advanced, rarely used path (for
 * leaders who keep their own copy instead of the online save), so it sits
 * behind one quiet text link, says "backup file" instead of "JSON", and
 * explains in one line that signed-in studies are already saved online.
 */
import React, { useRef, useState } from 'react';
import type { LocalPacks } from './useLocalPacks';
import { NS_BACKUP_TOGGLE, NS_BACKUP_NOTE, NS_BACKUP_DOWNLOAD, NS_BACKUP_RESTORE, NS_BACKUP_RESTORED } from './newStudyStrings';
import { secondaryButtonClass, controlStyle, textStyle } from './newStudyStyles';

const BackupPanel: React.FC<{ packs: LocalPacks }> = ({ packs }) => {
  const [open, setOpen] = useState(false);
  const [restored, setRestored] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const restore = async (file: File) => {
    const n = await packs.importBackup(file);
    setRestored(n > 0 ? n : null);   // a failure is shown by PackList as packs.error
  };

  return (
    <div data-testid="backup">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="backup-toggle"
        className="text-slate-400 underline underline-offset-4 hover:text-slate-200" style={controlStyle}>
        {NS_BACKUP_TOGGLE}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-3 rounded-xl border border-slate-800 p-4" data-testid="backup-panel">
          <p className="text-slate-400" style={textStyle}>{NS_BACKUP_NOTE}</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={packs.exportBackup} disabled={packs.packs.length === 0}
              className={secondaryButtonClass} style={controlStyle}>{NS_BACKUP_DOWNLOAD}</button>
            <button type="button" onClick={() => fileRef.current?.click()} className={secondaryButtonClass} style={controlStyle}>
              {NS_BACKUP_RESTORE}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="ns-import-file"
            aria-label={NS_BACKUP_RESTORE}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) void restore(file);
              e.target.value = '';
            }} />
          {restored !== null && <p role="status" className="text-emerald-300" style={textStyle}>{NS_BACKUP_RESTORED(restored)}</p>}
        </div>
      )}
    </div>
  );
};

export default BackupPanel;
