import React, { useState } from 'react';

interface ClearDataDialogProps {
  noteCount: number;
  researchCount: number;
  annotationCount: number;
  onConfirm: (types: { notes: boolean; research: boolean; annotations: boolean }) => void;
  onClose: () => void;
}

const ClearDataDialog: React.FC<ClearDataDialogProps> = ({
  noteCount, researchCount, annotationCount, onConfirm, onClose
}) => {
  const [selected, setSelected] = useState({ notes: false, research: false, annotations: false });

  const toggle = (key: keyof typeof selected) =>
    setSelected(prev => ({ ...prev, [key]: !prev[key] }));

  const anySelected = selected.notes || selected.research || selected.annotations;
  const totalSelected =
    (selected.notes ? noteCount : 0) +
    (selected.research ? researchCount : 0) +
    (selected.annotations ? annotationCount : 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-[90%] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">清空笔记 Delete Notes</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500">选择要删除的数据类型 Select data types to delete:</p>

          <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
            selected.notes ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:bg-slate-50'
          } ${noteCount === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
            <input type="checkbox" checked={selected.notes} onChange={() => toggle('notes')}
              className="rounded border-slate-300 text-red-600 focus:ring-red-500" disabled={noteCount === 0} />
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-700">📝 个人笔记 Notes</div>
              <div className="text-xs text-slate-400">{noteCount} entries</div>
            </div>
          </label>

          <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
            selected.research ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:bg-slate-50'
          } ${researchCount === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
            <input type="checkbox" checked={selected.research} onChange={() => toggle('research')}
              className="rounded border-slate-300 text-red-600 focus:ring-red-500" disabled={researchCount === 0} />
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-700">🔍 AI研究 Research</div>
              <div className="text-xs text-slate-400">{researchCount} entries</div>
            </div>
          </label>

          <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
            selected.annotations ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:bg-slate-50'
          } ${annotationCount === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
            <input type="checkbox" checked={selected.annotations} onChange={() => toggle('annotations')}
              className="rounded border-slate-300 text-red-600 focus:ring-red-500" disabled={annotationCount === 0} />
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-700">✏️ 手写标注 Annotations</div>
              <div className="text-xs text-slate-400">{annotationCount} entries</div>
            </div>
          </label>
        </div>

        <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            取消 Cancel
          </button>
          <button
            onClick={() => onConfirm(selected)}
            disabled={!anySelected}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              anySelected ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            删除 Delete ({totalSelected})
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClearDataDialog;
