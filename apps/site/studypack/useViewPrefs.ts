/**
 * useViewPrefs.ts — TV view's 显示偏好 state · 显示偏好
 *
 * Loads this device's view prefs (shared/studypack/packPrefs), persists
 * changes, and owns the one-time "试试「偏好」" hint (first-use guide rule):
 * shown beside the button until the panel is first opened on this device.
 */
import { useState } from 'react';
import { STORAGE_KEYS } from '../../../shared/constants/storageKeys';
import { loadViewPrefs, saveViewPrefs, type ViewPrefs } from '../../../shared/studypack/packPrefs';
import { VP_HINT } from './prefsStrings';

function hintSeen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.TV_PREFS_HINT_SEEN) === '1';
  } catch {
    // Storage blocked: showing the hint again is harmless.
    return false;
  }
}

export interface ViewPrefsState {
  prefs: ViewPrefs;
  open: boolean;
  /** The one-time hint text beside the 偏好 button, or null once seen. */
  hint: string | null;
  openPanel: () => void;
  closePanel: () => void;
  change: (prefs: ViewPrefs) => void;
}

export function useViewPrefs(): ViewPrefsState {
  const [prefs, setPrefs] = useState(loadViewPrefs);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(() => (hintSeen() ? null : VP_HINT));
  const openPanel = () => {
    setOpen(true);
    setHint(null);
    try {
      window.localStorage.setItem(STORAGE_KEYS.TV_PREFS_HINT_SEEN, '1');
    } catch {
      // Storage blocked: the hint returns next visit, which is harmless.
    }
  };
  const change = (next: ViewPrefs) => {
    setPrefs(next);
    saveViewPrefs(next);
  };
  return { prefs, open, hint, openPanel, closePanel: () => setOpen(false), change };
}
