import React, { useState } from 'react';
import { BIBLE_BOOKS } from '../constants';
import { getChineseName } from '../services/bibleBookData';
import type { PrintOptions } from '../services/printService';

interface PrintOptionsDialogProps {
  onClose: () => void;
  onPrint: (options: PrintOptions) => void;
}

type DatePreset = 'all' | '7d' | '30d' | '90d' | 'custom';

const PrintOptionsDialog: React.FC<PrintOptionsDialogProps> = ({ onClose, onPrint }) => {
  const [includeVerseText, setIncludeVerseText] = useState(true);
  const [includeAI, setIncludeAI] = useState(true);
  const [includeDrawings, setIncludeDrawings] = useState(true);

  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [selectedBook, setSelectedBook] = useState('');
  const [chapterFrom, setChapterFrom] = useState('');
  const [chapterTo, setChapterTo] = useState('');

  const selectedBookData = selectedBook ? BIBLE_BOOKS.find(b => b.id === selectedBook) : null;

  const handlePrint = () => {
    const options: PrintOptions = {
      includeVerseText,
      includeAI,
      includeDrawings,
    };

    // Date filter
    const now = Date.now();
    if (datePreset === '7d') {
      options.dateFrom = now - 7 * 24 * 60 * 60 * 1000;
    } else if (datePreset === '30d') {
      options.dateFrom = now - 30 * 24 * 60 * 60 * 1000;
    } else if (datePreset === '90d') {
      options.dateFrom = now - 90 * 24 * 60 * 60 * 1000;
    } else if (datePreset === 'custom') {
      if (customFrom) options.dateFrom = new Date(customFrom).getTime();
      if (customTo) options.dateTo = new Date(customTo + 'T23:59:59').getTime();
    }

    // Book/chapter filter
    if (selectedBook) {
      options.bookId = selectedBook;
      if (chapterFrom) options.chapterFrom = parseInt(chapterFrom);
      if (chapterTo) options.chapterTo = parseInt(chapterTo);
    }

    onPrint(options);
  };

  return (
    <div className="flex flex-col max-h-[80vh]">
      {/* Header */}
      <div className="px-5 py-4 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Print Options</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Content Toggles */}
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-2">Content</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includeVerseText} onChange={e => setIncludeVerseText(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
              <span className="text-sm text-slate-700">Include verse text</span>
              <span className="text-xs text-slate-400">经文原文</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includeAI} onChange={e => setIncludeAI(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
              <span className="text-sm text-slate-700">Include AI research</span>
              <span className="text-xs text-slate-400">AI研究</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includeDrawings} onChange={e => setIncludeDrawings(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
              <span className="text-sm text-slate-700">Include drawings</span>
              <span className="text-xs text-slate-400">手绘图</span>
            </label>
          </div>
        </div>

        {/* Date Range */}
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-2">Date Range <span className="font-normal text-slate-400">时间范围</span></h3>
          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'All time'],
              ['7d', 'Last 7 days'],
              ['30d', 'Last 30 days'],
              ['90d', 'Last 90 days'],
              ['custom', 'Custom'],
            ] as [DatePreset, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDatePreset(key)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  datePreset === key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {datePreset === 'custom' && (
            <div className="flex gap-3 mt-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>
          )}
        </div>

        {/* Book/Chapter Filter */}
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-2">Book / Chapter <span className="font-normal text-slate-400">书卷/章节</span></h3>
          <select
            value={selectedBook}
            onChange={e => { setSelectedBook(e.target.value); setChapterFrom(''); setChapterTo(''); }}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          >
            <option value="">All books 全部书卷</option>
            <optgroup label="Old Testament 旧约">
              {BIBLE_BOOKS.filter((_, i) => i < 39).map(b => (
                <option key={b.id} value={b.id}>{getChineseName(b.id)} {b.name}</option>
              ))}
            </optgroup>
            <optgroup label="New Testament 新约">
              {BIBLE_BOOKS.filter((_, i) => i >= 39).map(b => (
                <option key={b.id} value={b.id}>{getChineseName(b.id)} {b.name}</option>
              ))}
            </optgroup>
          </select>

          {selectedBookData && (
            <div className="flex gap-3 mt-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">From chapter</label>
                <input
                  type="number"
                  min={1}
                  max={selectedBookData.chapters}
                  placeholder="1"
                  value={chapterFrom}
                  onChange={e => setChapterFrom(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">To chapter</label>
                <input
                  type="number"
                  min={1}
                  max={selectedBookData.chapters}
                  placeholder={String(selectedBookData.chapters)}
                  value={chapterTo}
                  onChange={e => setChapterTo(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t bg-slate-50 flex justify-end gap-3 rounded-b-lg">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handlePrint}
          className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      </div>
    </div>
  );
};

export default PrintOptionsDialog;
