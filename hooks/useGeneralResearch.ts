import { useState, useEffect } from 'react';
import { verseDataStorage } from '../services/verseDataStorage';
import { AIResearchEntry } from '../types/verseData';
import { useStorageUpdate } from './useStorageUpdate';

export type GeneralResearchEntry = AIResearchEntry;

export function useGeneralResearch() {
  const storageTick = useStorageUpdate();
  const [entries, setEntries] = useState<GeneralResearchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    const fetchGeneralResearch = async () => {
      try {
        if (initialLoad) setLoading(true);
        const allData = await verseDataStorage.getAllData();

        // Filter for GENERAL bookId and extract AI research
        const generalEntries = allData
          .filter(v => v.bookId === 'GENERAL')
          .flatMap(v => v.aiResearch)
          .sort((a, b) => b.timestamp - a.timestamp); // Newest first

        setEntries(generalEntries);
      } catch (error) {
        setEntries([]);
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    };

    fetchGeneralResearch();
  }, [storageTick]);

  const deleteEntry = async (researchId: string): Promise<boolean> => {
    try {
      await verseDataStorage.deleteAIResearch('GENERAL', 0, [0], researchId);
      return true;
    } catch (error) {
      return false;
    }
  };

  return { entries, loading, deleteEntry };
}
