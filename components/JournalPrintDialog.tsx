import React, { useState, useMemo } from 'react';
import type { JournalEntry } from '../services/idbService';
import type { JournalPrintOptions } from '../utils/journalPrintRenderer';

interface JournalPrintDialogProps {
  entries: JournalEntry[];
  selectedEntryId?: string | null;
  onPrint: (entryIds: string[], options: JournalPrintOptions) => void;
  onClose: () => void;
}

type SelectionMode = 'current' | 'selected' | 'dateRange' | 'all';

export default function JournalPrintDialog({ entries, selectedEntryId, onPrint, onClose }: JournalPrintDialogProps) {
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(selectedEntryId ? 'current' : 'all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(selectedEntryId ? [selectedEntryId] : []));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeDrawings, setIncludeDrawings] = useState(true);
  const [includeImages, setIncludeImages] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [pageSize, setPageSize] = useState<'letter' | 'A4'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  const entriesToPrint = useMemo(() => {
    switch (selectionMode) {
      case 'current':
        return selectedEntryId ? entries.filter(e => e.id === selectedEntryId) : [];
      case 'selected':
        return entries.filter(e => selectedIds.has(e.id));
      case 'dateRange': {
        const from = dateFrom ? new Date(dateFrom).getTime() : 0;
        const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : Infinity;
        return entries.filter(e => {
          const t = new Date(e.createdAt).getTime();
          return t >= from && t <= to;
        });
      }
      case 'all':
        return entries;
      default:
        return [];
    }
  }, [selectionMode, selectedEntryId, selectedIds, dateFrom, dateTo, entries]);

  const toggleEntry = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrint = () => {
    const ids = entriesToPrint.map(e => e.id);
    if (ids.length === 0) return;
    onPrint(ids, { includeDrawings, includeImages, includeMetadata, pageSize, orientation });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }}
      />
      {/* Dialog */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          width: 420, maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto',
          zIndex: 101, padding: 24,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#1a1a2e' }}>Print Journal</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280', padding: 4 }}>&times;</button>
        </div>

        {/* Selection Mode */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>What to print</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selectedEntryId && (
              <label style={radioLabelStyle}>
                <input type="radio" name="mode" checked={selectionMode === 'current'} onChange={() => setSelectionMode('current')} />
                Current entry
              </label>
            )}
            <label style={radioLabelStyle}>
              <input type="radio" name="mode" checked={selectionMode === 'selected'} onChange={() => setSelectionMode('selected')} />
              Select entries
            </label>
            <label style={radioLabelStyle}>
              <input type="radio" name="mode" checked={selectionMode === 'dateRange'} onChange={() => setSelectionMode('dateRange')} />
              Date range
            </label>
            <label style={radioLabelStyle}>
              <input type="radio" name="mode" checked={selectionMode === 'all'} onChange={() => setSelectionMode('all')} />
              All entries ({entries.length})
            </label>
          </div>
        </div>

        {/* Date range picker */}
        {selectionMode === 'dateRange' && (
          <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={smallLabelStyle}>From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={smallLabelStyle}>To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={inputStyle} />
            </div>
          </div>
        )}

        {/* Entry selector */}
        {selectionMode === 'selected' && (
          <div style={{ marginBottom: 16, maxHeight: 160, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 4 }}>
            {entries.map(e => (
              <label key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 13,
                cursor: 'pointer', borderRadius: 4,
                background: selectedIds.has(e.id) ? '#eef2ff' : 'transparent',
              }}>
                <input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggleEntry(e.id)} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.title || 'Untitled'}
                </span>
                <span style={{ color: '#9ca3af', fontSize: 11, flexShrink: 0 }}>
                  {new Date(e.createdAt).toLocaleDateString()}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Options */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Options</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={includeDrawings} onChange={e => setIncludeDrawings(e.target.checked)} />
              Include drawings
            </label>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={includeImages} onChange={e => setIncludeImages(e.target.checked)} />
              Include images
            </label>
            <label style={checkboxLabelStyle}>
              <input type="checkbox" checked={includeMetadata} onChange={e => setIncludeMetadata(e.target.checked)} />
              Include metadata (date, location, tags)
            </label>
          </div>
        </div>

        {/* Page settings */}
        <div style={{ marginBottom: 20, display: 'flex', gap: 16 }}>
          <div>
            <label style={smallLabelStyle}>Page size</label>
            <select value={pageSize} onChange={e => setPageSize(e.target.value as 'letter' | 'A4')}
              style={inputStyle}>
              <option value="A4">A4</option>
              <option value="letter">Letter</option>
            </select>
          </div>
          <div>
            <label style={smallLabelStyle}>Orientation</label>
            <select value={orientation} onChange={e => setOrientation(e.target.value as 'portrait' | 'landscape')}
              style={inputStyle}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>
        </div>

        {/* Summary */}
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, padding: '8px 12px', background: '#f9fafb', borderRadius: 6 }}>
          {entriesToPrint.length === 0
            ? 'No entries selected'
            : `${entriesToPrint.length} ${entriesToPrint.length === 1 ? 'entry' : 'entries'} will be printed`
          }
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#374151' }}>
            Cancel
          </button>
          <button onClick={handlePrint} disabled={entriesToPrint.length === 0}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: 6, cursor: entriesToPrint.length > 0 ? 'pointer' : 'default',
              fontSize: 14, fontWeight: 600, color: '#fff',
              background: entriesToPrint.length > 0 ? '#4f46e5' : '#a5b4fc',
            }}>
            Print ({entriesToPrint.length})
          </button>
        </div>
      </div>
    </>
  );
}

const radioLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' };
const checkboxLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' };
const smallLabelStyle: React.CSSProperties = { fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 };
const inputStyle: React.CSSProperties = { padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%' };
