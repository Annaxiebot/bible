import { useState, useEffect } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';

export function useBibleSettings() {
  const [isSimplified, setIsSimplified] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CHINESE_MODE);
    return saved === 'simplified';
  });

  const [englishVersion, setEnglishVersion] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.ENGLISH_VERSION) || 'web';
  });

  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.FONT_SIZE);
    return saved ? parseInt(saved) : 18;
  });

  useEffect(() => {
    const handleVersionChange = () => {
      const version = localStorage.getItem(STORAGE_KEYS.ENGLISH_VERSION) || 'web';
      setEnglishVersion(version);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.ENGLISH_VERSION) {
        setEnglishVersion(e.newValue || 'web');
      }
    };

    window.addEventListener('bibleEnglishVersionChanged', handleVersionChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('bibleEnglishVersionChanged', handleVersionChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return {
    isSimplified,
    setIsSimplified,
    englishVersion,
    setEnglishVersion,
    fontSize,
    setFontSize,
  };
}
