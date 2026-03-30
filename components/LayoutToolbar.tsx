import React from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';

export type LayoutMode = 'bible' | 'chat' | 'notes' | 'study';

interface LayoutToolbarProps {
  currentMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  isIPhone?: boolean;
  isMobile?: boolean;
}

/** Derive the active layout mode from vertical/horizontal split percentages. */
export function getLayoutMode(vertical: number, horizontal: number): LayoutMode {
  if (vertical >= 95) return 'bible';
  if (vertical <= 5 && horizontal >= 95) return 'chat';
  if (vertical <= 5 && horizontal <= 5) return 'notes';
  return 'study';
}

/** Convert a layout mode to vertical/horizontal split percentages. */
export function layoutModeToSplits(mode: LayoutMode, isMobile = false): { vertical: number; horizontal: number } {
  switch (mode) {
    case 'bible': return { vertical: 100, horizontal: 100 };
    case 'chat':  return { vertical: 0, horizontal: 100 };
    case 'notes': return { vertical: 0, horizontal: 0 };
    // Mobile study: Bible (Chinese) top + AI chat bottom. Desktop: Bible + Chat/Notes side-by-side
    case 'study': return { vertical: 50, horizontal: isMobile ? 100 : 50 };
  }
}

/** Read the saved preferred layout from localStorage, or return a default. */
export function getSavedLayout(isMobile: boolean): LayoutMode {
  const saved = localStorage.getItem(STORAGE_KEYS.PREFERRED_LAYOUT);
  if (saved === 'bible' || saved === 'chat' || saved === 'notes' || saved === 'study') {
    return saved;
  }
  return isMobile ? 'bible' : 'bible';
}

const LAYOUT_ITEMS: { mode: LayoutMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: 'bible',
    label: 'Bible',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    mode: 'chat',
    label: 'AI Chat',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    mode: 'notes',
    label: 'Notes',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  {
    mode: 'study',
    label: 'Study',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
      </svg>
    ),
  },
];

const LayoutToolbar: React.FC<LayoutToolbarProps> = ({ currentMode, onLayoutChange, isIPhone, isMobile }) => {
  const handleClick = (mode: LayoutMode) => {
    localStorage.setItem(STORAGE_KEYS.PREFERRED_LAYOUT, mode);
    onLayoutChange(mode);
  };

  const barHeight = isIPhone ? 'h-14' : 'h-11';

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center ${barHeight} bg-white/90 backdrop-blur-sm border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center gap-1">
        {LAYOUT_ITEMS.map(({ mode, label, icon }) => {
          const active = currentMode === mode;
          return (
            <button
              key={mode}
              onClick={() => handleClick(mode)}
              className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-all ${
                active
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
              title={label}
              aria-label={`${label} layout`}
              data-testid={`layout-btn-${mode}`}
            >
              {icon}
              <span className="text-[10px] font-medium mt-0.5 leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LayoutToolbar;
