import { useState, useEffect } from 'react';
import { verseDataStorage } from '../services/verseDataStorage';
import { AIResearchEntry } from '../types/verseData';
import { useStorageUpdate } from './useStorageUpdate';

export interface GeneralResearchEntry extends AIResearchEntry {
  // Inherits all fields from AIResearchEntry
}

export function useGeneralResearch() {
  const storageTick = useStorageUpdate();
  const [entries, setEntries] = useState<GeneralResearchEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGeneralResearch = async () => {
      try {
        setLoading(true);
        const allData = await verseDataStorage.getAllData();
        
        // Filter for GENERAL bookId and extract AI research
        const generalEntries = allData
          .filter(v => v.bookId === 'GENERAL')
          .flatMap(v => v.aiResearch)
          .sort((a, b) => b.timestamp - a.timestamp); // Newest first

        setEntries(generalEntries);
      } catch (error) {
        // Silently handle error
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGeneralResearch();
  }, [storageTick]);

  const deleteEntry = async (researchId: string) => {
    try {
      await verseDataStorage.deleteAIResearch('GENERAL', 0, [0], researchId);
      // Storage update event will trigger refetch
    } catch (error) {
      // Silently handle error
    }
  };

  return { entries, loading, deleteEntry };
}
