import { useState, useCallback } from 'react';
import type { PaperType } from '../services/strokeNormalizer';

const PAPER_TYPE_STORAGE_KEY = 'bible-annotation-paper-type';

/** Shared hook for paper type preference. Persists to localStorage. */
export function usePaperType() {
  const [paperType, setPaperTypeState] = useState<PaperType>(() => {
    try {
      const stored = localStorage.getItem(PAPER_TYPE_STORAGE_KEY);
      if (stored === 'grid' || stored === 'ruled' || stored === 'plain') return stored;
    } catch { /* ignore */ }
    return 'plain';
  });

  const setPaperType = useCallback((type: PaperType) => {
    setPaperTypeState(type);
    try { localStorage.setItem(PAPER_TYPE_STORAGE_KEY, type); } catch { /* ignore */ }
  }, []);

  return { paperType, setPaperType };
}
