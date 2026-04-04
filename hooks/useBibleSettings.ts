import { useState, useEffect } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { preloadConverter } from '../services/chineseConverter';

export function useBibleSettings() {
  const [isSimplified, setIsSimplified] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CHINESE_MODE);
    // Default to simplified if no preference saved
    const simplified = saved ? saved === 'simplified' : true;
    if (simplified) preloadConverter();
    return simplified;
  });

  const [chineseVersion, setChineseVersion] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.CHINESE_VERSION) || 'cuv';
  });

  const [englishVersion, setEnglishVersion] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.ENGLISH_VERSION) || 'web';
  });

  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.FONT_SIZE);
    return saved ? parseInt(saved) : 18;
  });

  useEffect(() => {
    const handleEnglishVersionChange = () => {
      const version = localStorage.getItem(STORAGE_KEYS.ENGLISH_VERSION) || 'web';
      setEnglishVersion(version);
    };

    const handleChineseVersionChange = () => {
      const version = localStorage.getItem(STORAGE_KEYS.CHINESE_VERSION) || 'cuv';
      setChineseVersion(version);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.ENGLISH_VERSION) {
        setEnglishVersion(e.newValue || 'web');
      }
      if (e.key === STORAGE_KEYS.CHINESE_VERSION) {
        setChineseVersion(e.newValue || 'cuv');
      }
    };

    window.addEventListener('bibleEnglishVersionChanged', handleEnglishVersionChange);
    window.addEventListener('bibleChineseVersionChanged', handleChineseVersionChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('bibleEnglishVersionChanged', handleEnglishVersionChange);
      window.removeEventListener('bibleChineseVersionChanged', handleChineseVersionChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return {
    isSimplified,
    setIsSimplified,
    chineseVersion,
    setChineseVersion,
    englishVersion,
    setEnglishVersion,
    fontSize,
    setFontSize,
  };
}
