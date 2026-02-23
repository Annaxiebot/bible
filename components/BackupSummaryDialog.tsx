import React from 'react';

export interface BackupSummary {
  version?: string;
  exportDate?: string;
  notes: number;
  aiResearch: number;
  annotations: number;
  bookmarks: number;
  historyEntries: number;
  readingPlans: number;
  bibleChapters: number;
  booksIncluded?: string[];
}

interface BackupSummaryDialogProps {
  mode: 'export' | 'import';
  summary: BackupSummary;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const BackupSummaryDialog: React.FC<BackupSummaryDialogProps> = ({
  mode, summary, onConfirm, onCancel, loading
}) => {
  const rows: { label: string; zhLabel: string; count: number; icon: string }[] = [
    { label: 'Personal Notes', zhLabel: '个人笔记', count: summary.notes, icon: '📝' },
    { label: 'AI Research', zhLabel: 'AI研究', count: summary.aiResearch, icon: '🔍' },
    { label: 'Annotations', zhLabel: '手写标注', count: summary.annotations, icon: '✏️' },
    { label: 'Bookmarks', zhLabel: '书签', count: summary.bookmarks, icon: '🔖' },
    { label: 'Reading History', zhLabel: '阅读历史', count: summary.historyEntries, icon: '📖' },
    { label: 'Reading Plans', zhLabel: '阅读计划', count: summary.readingPlans, icon: '📅' },
    { label: 'Bible Chapters', zhLabel: '离线章节', count: summary.bibleChapters, icon: '📕' },
  ];

  const totalItems = rows.reduce((a, r) => a + r.count, 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-[90%] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4">
          <h3 className="text-white font-bold text-base">
            {mode === 'export' ? '📦 备份摘要 Backup Summary' : '📥 恢复摘要 Restore Summary'}
          </h3>
          {summary.exportDate && mode === 'import' && (
            <p className="text-indigo-200 text-xs mt-1">
              Backup from: {new Date(summary.exportDate).toLocaleString()}
              {summary.version && ` (v${summary.version})`}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <div className="space-y-2">
            {rows.map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">
                  {row.icon} {row.zhLabel} {row.label}
                </span>
                <span className={`text-sm font-semibold ${row.count > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                  {row.count}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Total</span>
            <span className="text-sm font-bold text-indigo-700">{totalItems} items</span>
          </div>

          {mode === 'import' && (
            <p className="mt-3 text-xs text-slate-500">
              Data will be merged with your existing data. Existing entries won't be overwritten.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-3 bg-slate-50 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            取消 Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || totalItems === 0}
            className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading
              ? '处理中...'
              : mode === 'export'
                ? '导出 Export'
                : '恢复 Restore'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackupSummaryDialog;
