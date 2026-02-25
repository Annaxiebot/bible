import { useEffect, useState } from 'react';

export function useStorageUpdate(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick(t => t + 1);
    window.addEventListener('versedata-updated', handler);
    return () => window.removeEventListener('versedata-updated', handler);
  }, []);
  return tick;
}
