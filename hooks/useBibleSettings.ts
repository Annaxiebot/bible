import { useState, useEffect } from 'react';

export function useBibleSettings() {
  const [isSimplified, setIsSimplified] = useState(() => {
    const saved = localStorage.getItem('bibleChineseMode');
    return saved === 'simplified';
  });

  const [englishVersion, setEnglishVersion] = useState(() => {
    return localStorage.getItem('bibleEnglishVersion') || 'web';
  });

  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('bibleFontSize');
    return saved ? parseInt(saved) : 18;
  });

  useEffect(() => {
    const handleVersionChange = () => {
      const version = localStorage.getItem('bibleEnglishVersion') || 'web';
      setEnglishVersion(version);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'bibleEnglishVersion') {
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
