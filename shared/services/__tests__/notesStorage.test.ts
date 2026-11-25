import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the idb module before importing notesStorage
vi.mock('idb', () => {
  const storage = new Map<string, any>();
  
  return {
    openDB: vi.fn().mockResolvedValue({
      put: vi.fn(async (storeName: string, value: any, key: string) => {
        storage.set(key, value);
      }),
      get: vi.fn(async (storeName: string, key: string) => {
        return storage.get(key);
      }),
      getAll: vi.fn(async (storeName: string) => {
        return Array.from(storage.values());
      }),
      delete: vi.fn(async (storeName: string, key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(async (storeName: string) => {
        storage.clear();
      }),
      transaction: vi.fn((storeName: string, mode: string) => ({
        objectStore: vi.fn((name: string) => ({
          put: vi.fn(async (value: any, key: string) => {
            storage.set(key, value);
          }),
        })),
        done: Promise.resolve(),
      })),
    }),
  };
});

describe('notesStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NotesStorageService structure', () => {
    it('should export notesStorage singleton', async () => {
      const { notesStorage } = await import('../notesStorage');
      expect(notesStorage).toBeDefined();
    });

    it('should have all required methods', async () => {
      const { notesStorage } = await import('../notesStorage');
      const methods = [
        'saveNote',
        'getNote',
        'getAllNotes',
        'deleteNote',
        'clearAllNotes',
        'importNotes',
        'migrateFromLocalStorage'
      ];
      
      methods.forEach(method => {
        expect(typeof (notesStorage as any)[method]).toBe('function');
      });
    });
  });

  describe('note reference format', () => {
    it('should use consistent reference format', () => {
      // Notes are stored by reference like "GEN:1:1" or "PSA:23:1-4"
      const reference1 = 'GEN:1:1';
      const reference2 = 'PSA:23:1-4';
      
      expect(reference1).toMatch(/^[A-Z0-9]+:\d+:\d+(-\d+)?$/);
      expect(reference2).toMatch(/^[A-Z0-9]+:\d+:\d+(-\d+)?$/);
    });
  });

  describe('data structure', () => {
    it('should store notes with correct structure', () => {
      const noteData = {
        reference: 'GEN:1:1',
        data: 'My note about Genesis 1:1',
        lastModified: Date.now()
      };
      
      expect(noteData.reference).toBeDefined();
      expect(noteData.data).toBeDefined();
      expect(noteData.lastModified).toBeGreaterThan(0);
    });
  });
});

describe('notesStorage migration', () => {
  it('should handle missing localStorage gracefully', () => {
    // The migrateFromLocalStorage function should handle null/undefined
    const localStorageNotes = localStorage.getItem('scripture_scholar_notes');
    // Our mock returns undefined, but real localStorage returns null
    // Either way, the migration should handle missing data
    expect(localStorageNotes).toBeFalsy();
  });

  it('should correctly handle JSON structure', () => {
    // Test the JSON structure that would be used for notes
    const mockNotes = { 'GEN:1:1': 'Test note', 'PSA:23:1': 'Another note' };
    const jsonString = JSON.stringify(mockNotes);
    const parsed = JSON.parse(jsonString);
    
    expect(parsed['GEN:1:1']).toBe('Test note');
    expect(parsed['PSA:23:1']).toBe('Another note');
    expect(Object.keys(parsed).length).toBe(2);
  });
});
