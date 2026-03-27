import { useEffect, useState } from 'react';

export function useStorageUpdate(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick(t => t + 1);
    window.addEventListener('versedata-updated', handler);
    window.addEventListener('annotation-updated', handler);
    return () => {
      window.removeEventListener('versedata-updated', handler);
      window.removeEventListener('annotation-updated', handler);
    };
  }, []);
  return tick;
}
