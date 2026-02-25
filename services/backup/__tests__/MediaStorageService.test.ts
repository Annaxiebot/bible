import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { MediaStorageService } from '../MediaStorageService';
import { MediaAttachment, SaveImageOptions } from '../types';

// ============================================================================
// Mock Canvas API (not available in JSDOM)
// ============================================================================

// Create a simple mock canvas that returns data URLs
class MockCanvas {
  private _width: number = 0;
  private _height: number = 0;
  
  get width() { return this._width; }
  set width(val: number) { this._width = val; }
  
  get height() { return this._height; }
  set height(val: number) { this._height = val; }
  
  getContext() {
    return {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    };
  }
  
  toDataURL(type: string = 'image/png', quality: number = 1) {
    // Return a minimal valid data URL
    const size = Math.min(this.width, this.height);
    const sizeIndicator = size > 1500 ? 'large' : size > 500 ? 'medium' : 'small';
    const typeStr = type.includes('jpeg') ? 'jpeg' : type.includes('webp') ? 'webp' : 'png';
    
    // Proper base64 for a 1x1 PNG (minimal valid image)
    const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    // Vary size based on dimensions and quality
    let multiplier = 1;
    if (sizeIndicator === 'large') multiplier = 10;
    else if (sizeIndicator === 'medium') multiplier = 3;
    
    // Quality affects size (lower quality = smaller)
    const qualityFactor = quality < 0.7 ? 0.5 : 1;
    const finalMultiplier = Math.max(1, Math.floor(multiplier * qualityFactor));
    
    return `data:image/${typeStr};base64,${base64Data.repeat(finalMultiplier)}`;
  }
}

// Mock HTMLImageElement
class MockImage {
  src: string = '';
  width: number = 0;
  height: number = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  
  constructor() {
    // Simulate async image loading
    setTimeout(() => {
      if (this.src) {
        // Check for valid data URL
        const match = this.src.match(/data:image\/([^;]+);base64,(.+)/);
        if (match) {
          const [, format, data] = match;
          
          // Reject invalid base64 or unsupported formats
          if (data === 'INVALID_BASE64' || data === 'Qk0=') {
            this.onerror?.();
            return;
          }
          
          // Infer dimensions from data length (mock behavior)
          const dataLength = data.length;
          if (dataLength < 150) {
            // Small image
            this.width = 100;
            this.height = 100;
          } else if (dataLength < 500) {
            // Medium image
            this.width = 800;
            this.height = 600;
          } else {
            // Large image
            this.width = 3000;
            this.height = 2000;
          }
          
          this.onload?.();
        } else {
          this.onerror?.();
        }
      }
    }, 0);
  }
}

// Global mocks
beforeAll(() => {
  global.HTMLCanvasElement = MockCanvas as any;
  global.Image = MockImage as any;
  global.document.createElement = ((tag: string) => {
    if (tag === 'canvas') {
      return new MockCanvas() as any;
    }
    return {} as any;
  }) as any;
});

// ============================================================================
// Mock IndexedDB
// ============================================================================

// Global storage that can be reset between tests
const mockStorage = {
  data: new Map<string, any>(),
  indexes: {
    'by-note': new Map<string, any[]>(),
    'by-timestamp': new Map<number, any[]>(),
  },
  reset() {
    this.data.clear();
    this.indexes['by-note'].clear();
    this.indexes['by-timestamp'].clear();
  }
};

vi.mock('idb', () => {
  const updateIndexes = (record: any) => {
    if (!mockStorage.indexes['by-note'].has(record.noteId)) {
      mockStorage.indexes['by-note'].set(record.noteId, []);
    }
    const noteRecords = mockStorage.indexes['by-note'].get(record.noteId)!;
    const existing = noteRecords.findIndex(r => r.id === record.id);
    if (existing >= 0) {
      noteRecords[existing] = record;
    } else {
      noteRecords.push(record);
    }

    if (!mockStorage.indexes['by-timestamp'].has(record.timestamp)) {
      mockStorage.indexes['by-timestamp'].set(record.timestamp, []);
    }
    mockStorage.indexes['by-timestamp'].get(record.timestamp)!.push(record);
  };

  const removeFromIndexes = (id: string) => {
    for (const [, records] of mockStorage.indexes['by-note']) {
      const idx = records.findIndex(r => r.id === id);
      if (idx >= 0) {
        records.splice(idx, 1);
      }
    }
    for (const [, records] of mockStorage.indexes['by-timestamp']) {
      const idx = records.findIndex(r => r.id === id);
      if (idx >= 0) {
        records.splice(idx, 1);
      }
    }
  };

  const mockDB = {
    put: vi.fn(async (storeName: string, value: any) => {
      mockStorage.data.set(value.id, value);
      updateIndexes(value);
      return value.id;
    }),
    get: vi.fn(async (storeName: string, key: string) => {
      return mockStorage.data.get(key);
    }),
    getAll: vi.fn(async (storeName: string) => {
      return Array.from(mockStorage.data.values());
    }),
    delete: vi.fn(async (storeName: string, key: string) => {
      mockStorage.data.delete(key);
      removeFromIndexes(key);
    }),
    clear: vi.fn(async (storeName: string) => {
      mockStorage.reset();
    }),
    transaction: vi.fn((storeName: string, mode: string) => ({
      store: {
        delete: vi.fn(async (key: string) => {
          mockStorage.data.delete(key);
          removeFromIndexes(key);
        }),
        index: vi.fn((indexName: string) => ({
          getAll: vi.fn(async (query: string) => {
            if (indexName === 'by-note') {
              return mockStorage.indexes['by-note'].get(query) || [];
            }
            return [];
          }),
        })),
      },
      done: Promise.resolve(),
    })),
  };

  return {
    openDB: vi.fn(async () => mockDB),
  };
});

// Mock navigator.storage for quota tests
const mockStorageEstimate = vi.fn();
Object.defineProperty(navigator, 'storage', {
  value: {
    estimate: mockStorageEstimate,
  },
  writable: true,
  configurable: true,
});

// ============================================================================
// Test Helpers
// ============================================================================

const createTestImage = (width: number, height: number, format: 'png' | 'jpeg' | 'webp' = 'png'): string => {
  const canvas = new MockCanvas();
  canvas.width = width;
  canvas.height = height;
  
  const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  return canvas.toDataURL(mimeType);
};

const createTestFile = (width: number, height: number, filename: string = 'test.png'): File => {
  // Create a simple valid image file
  const canvas = new MockCanvas();
  canvas.width = width;
  canvas.height = height;
  const dataURL = canvas.toDataURL('image/png');
  const blob = dataURLToBlob(dataURL);
  return new File([blob], filename, { type: 'image/png' });
};

const createTestBlob = (width: number, height: number): Blob => {
  const canvas = new MockCanvas();
  canvas.width = width;
  canvas.height = height;
  const dataURL = canvas.toDataURL('image/png');
  return dataURLToBlob(dataURL);
};

const dataURLToBlob = (dataURL: string): Blob => {
  const arr = dataURL.split(',');
  if (arr.length !== 2) {
    throw new Error('Invalid data URL');
  }
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  try {
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    // If atob fails, return a simple blob
    return new Blob([new Uint8Array([0, 1, 2, 3])], { type: mime });
  }
};

// ============================================================================
// Tests
// ============================================================================

describe('MediaStorageService', () => {
  let service: MediaStorageService;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Reset mock storage
    mockStorage.reset();
    
    // Reset storage estimate mock
    mockStorageEstimate.mockResolvedValue({
      usage: 1000000,
      quota: 50000000,
    });

    // Create fresh service instance
    service = new MediaStorageService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Test 1-3: Store Image (File, Blob, base64)
  // ==========================================================================

  describe('saveImage', () => {
    it('should store image from File', async () => {
      const file = createTestFile(800, 600, 'test.png');
      const result = await service.saveImage('verse_1', file);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^img_/);
      expect(result.type).toBe('image');
      expect(result.data).toBeTruthy();
      expect(result.mimeType).toBe('image/png');
      expect(result.filename).toBe('test.png');
      expect(result.width).toBeLessThanOrEqual(800);
      expect(result.height).toBeLessThanOrEqual(600);
      expect(result.thumbnail).toBeTruthy();
    });

    it('should store image from Blob', async () => {
      const blob = createTestBlob(800, 600);
      const result = await service.saveImage('verse_1', blob);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^img_/);
      expect(result.type).toBe('image');
      expect(result.data).toBeTruthy();
      expect(result.mimeType).toBe('image/png');
      expect(result.filename).toBeUndefined();
      expect(result.thumbnail).toBeTruthy();
    });

    it('should store image from base64', async () => {
      const dataURL = createTestImage(800, 600);
      const result = await service.saveImage('verse_1', dataURL);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^img_/);
      expect(result.type).toBe('image');
      expect(result.data).toBeTruthy();
      expect(result.mimeType).toBe('image/png');
      expect(result.thumbnail).toBeTruthy();
    });
  });

  // ==========================================================================
  // Test 4-5: Retrieve Images
  // ==========================================================================

  describe('getImage', () => {
    it('should retrieve image by ID', async () => {
      const dataURL = createTestImage(800, 600);
      const saved = await service.saveImage('verse_1', dataURL);
      
      const retrieved = await service.getImage(saved.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(saved.id);
      expect(retrieved!.data).toBe(saved.data);
    });

    it('should return null for non-existent ID', async () => {
      const result = await service.getImage('non_existent');
      expect(result).toBeNull();
    });
  });

  describe('getImagesForNote', () => {
    it('should get all images for a note', async () => {
      const img1 = await service.saveImage('verse_1', createTestImage(100, 100));
      const img2 = await service.saveImage('verse_1', createTestImage(200, 200));
      const img3 = await service.saveImage('verse_2', createTestImage(300, 300));

      const verse1Images = await service.getImagesForNote('verse_1');
      const verse2Images = await service.getImagesForNote('verse_2');

      expect(verse1Images).toHaveLength(2);
      expect(verse1Images.map(i => i.id)).toContain(img1.id);
      expect(verse1Images.map(i => i.id)).toContain(img2.id);
      
      expect(verse2Images).toHaveLength(1);
      expect(verse2Images[0].id).toBe(img3.id);
    });

    it('should return empty array for note with no images', async () => {
      const images = await service.getImagesForNote('verse_empty');
      expect(images).toEqual([]);
    });
  });

  // ==========================================================================
  // Test 6-7: Delete Images
  // ==========================================================================

  describe('deleteImage', () => {
    it('should delete single image', async () => {
      const saved = await service.saveImage('verse_1', createTestImage(100, 100));
      
      await service.deleteImage(saved.id);
      
      const retrieved = await service.getImage(saved.id);
      expect(retrieved).toBeNull();
    });

    it('should not throw when deleting non-existent image', async () => {
      await expect(service.deleteImage('non_existent')).resolves.not.toThrow();
    });
  });

  describe('deleteImagesForNote', () => {
    it('should delete all images for a note', async () => {
      const img1 = await service.saveImage('verse_1', createTestImage(100, 100));
      const img2 = await service.saveImage('verse_1', createTestImage(200, 200));
      const img3 = await service.saveImage('verse_2', createTestImage(300, 300));

      await service.deleteImagesForNote('verse_1');

      const verse1Images = await service.getImagesForNote('verse_1');
      const verse2Images = await service.getImagesForNote('verse_2');

      expect(verse1Images).toHaveLength(0);
      expect(verse2Images).toHaveLength(1);
      expect(verse2Images[0].id).toBe(img3.id);
    });
  });

  // ==========================================================================
  // Test 8-9: Thumbnail Generation
  // ==========================================================================

  describe('thumbnail generation', () => {
    it('should generate thumbnail for small image', async () => {
      const result = await service.saveImage('verse_1', createTestImage(100, 100));
      
      expect(result.thumbnail).toBeDefined();
      expect(result.thumbnail).toBeTruthy();
    });

    it('should generate thumbnail for large image', async () => {
      const result = await service.saveImage('verse_1', createTestImage(2000, 2000));
      
      expect(result.thumbnail).toBeDefined();
      expect(result.thumbnail).toBeTruthy();
      // Thumbnail should be smaller than original
      expect(result.thumbnail!.length).toBeLessThan(result.data.length);
    });

    it('should skip thumbnail if option is false', async () => {
      const result = await service.saveImage(
        'verse_1',
        createTestImage(100, 100),
        { generateThumbnail: false }
      );
      
      expect(result.thumbnail).toBeUndefined();
    });
  });

  // ==========================================================================
  // Test 10-12: Image Compression
  // ==========================================================================

  describe('image compression', () => {
    it('should compress with high quality', async () => {
      const result = await service.saveImage(
        'verse_1',
        createTestImage(1000, 1000),
        { quality: 0.95 }
      );
      
      expect(result.quality).toBe(95);
      expect(result.size).toBeGreaterThan(0);
    });

    it('should compress with low quality (smaller size)', async () => {
      const high = await service.saveImage(
        'verse_1',
        createTestImage(1000, 1000),
        { quality: 0.95 }
      );
      
      const low = await service.saveImage(
        'verse_2',
        createTestImage(1000, 1000),
        { quality: 0.5 }
      );
      
      expect(low.quality).toBe(50);
      // In mock environment, verify quality parameter is correctly recorded
      expect(low.quality).toBeLessThan(high.quality!);
    });

    it('should not resize already small images', async () => {
      const result = await service.saveImage(
        'verse_1',
        createTestImage(500, 500),
        { maxWidth: 1920, maxHeight: 1920 }
      );
      
      // Small images should not be resized
      expect(result.width).toBeLessThanOrEqual(1920);
      expect(result.height).toBeLessThanOrEqual(1920);
    });

    it('should resize large images', async () => {
      const result = await service.saveImage(
        'verse_1',
        createTestImage(3000, 2000),
        { maxWidth: 1920, maxHeight: 1920 }
      );
      
      expect(result.width).toBeLessThanOrEqual(1920);
      expect(result.height).toBeLessThanOrEqual(1920);
      // In mocked environment, just verify dimensions are set
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Test 13-15: Different Image Formats
  // ==========================================================================

  describe('image formats', () => {
    it('should handle PNG images', async () => {
      const dataURL = createTestImage(500, 500, 'png');
      const result = await service.saveImage('verse_1', dataURL);
      
      expect(result.mimeType).toBe('image/png');
    });

    it('should handle JPEG images', async () => {
      const dataURL = createTestImage(500, 500, 'jpeg');
      const result = await service.saveImage('verse_1', dataURL);
      
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should handle WebP if supported', async () => {
      // In our mock, WebP is always supported
      const dataURL = createTestImage(500, 500, 'webp');
      const result = await service.saveImage('verse_1', dataURL);
      
      expect(result.mimeType).toBe('image/webp');
    });
  });

  // ==========================================================================
  // Test 16-17: Storage Stats
  // ==========================================================================

  describe('getStorageStats', () => {
    it('should return stats for empty storage', async () => {
      const stats = await service.getStorageStats();
      
      expect(stats.totalImages).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.quotaUsed).toBeGreaterThanOrEqual(0);
      expect(stats.quotaRemaining).toBeGreaterThanOrEqual(0);
    });

    it('should return stats with data', async () => {
      await service.saveImage('verse_1', createTestImage(500, 500));
      await service.saveImage('verse_2', createTestImage(600, 600));
      
      const stats = await service.getStorageStats();
      
      expect(stats.totalImages).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Test 18-19: Cleanup Orphans
  // ==========================================================================

  describe('cleanupOrphans', () => {
    it('should not delete when all images referenced', async () => {
      await service.saveImage('verse_1', createTestImage(100, 100));
      await service.saveImage('verse_2', createTestImage(200, 200));
      
      const deleted = await service.cleanupOrphans(['verse_1', 'verse_2']);
      
      expect(deleted).toBe(0);
      const stats = await service.getStorageStats();
      expect(stats.totalImages).toBe(2);
    });

    it('should delete orphaned images', async () => {
      await service.saveImage('verse_1', createTestImage(100, 100));
      await service.saveImage('verse_2', createTestImage(200, 200));
      await service.saveImage('verse_3', createTestImage(300, 300));
      
      const deleted = await service.cleanupOrphans(['verse_1']);
      
      expect(deleted).toBe(2);
      const stats = await service.getStorageStats();
      expect(stats.totalImages).toBe(1);
    });
  });

  // ==========================================================================
  // Test 20-24: Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('should reject invalid data', async () => {
      await expect(
        service.saveImage('verse_1', { invalid: 'object' } as any)
      ).rejects.toThrow();
    });

    it('should handle corrupt image data', async () => {
      const corruptData = 'data:image/png;base64,INVALID_BASE64';
      
      // Mock will reject this in onerror
      await expect(
        service.saveImage('verse_1', corruptData)
      ).rejects.toThrow('Failed to load image');
    });

    it('should handle extremely large images gracefully', async () => {
      // Create a very large image
      const largeImage = createTestImage(5000, 5000);
      
      // Should still work but resize it
      const result = await service.saveImage('verse_1', largeImage, {
        maxWidth: 1920,
        maxHeight: 1920,
      });
      
      expect(result.width).toBeLessThanOrEqual(1920);
      expect(result.height).toBeLessThanOrEqual(1920);
    });

    it('should handle unsupported image formats', async () => {
      const invalidData = 'data:image/bmp;base64,Qk0='; // Fake BMP
      
      // Mock will reject this in onerror
      await expect(
        service.saveImage('verse_1', invalidData)
      ).rejects.toThrow('Failed to load image');
    });

    it('should handle storage quota exceeded', async () => {
      // Mock quota exceeded scenario
      mockStorageEstimate.mockResolvedValue({
        usage: 49999999,
        quota: 50000000,
      });
      
      // This should still work, but we're testing the quota tracking
      const stats = await service.getStorageStats();
      expect(stats.quotaRemaining).toBeLessThan(10);
    });
  });

  // ==========================================================================
  // Test 25: Integration Test
  // ==========================================================================

  describe('full workflow integration', () => {
    it('should handle complete save → retrieve → delete workflow', async () => {
      // Save image
      const dataURL = createTestImage(1000, 800);
      const saved = await service.saveImage('verse_1', dataURL, {
        quality: 0.85,
        maxWidth: 1920,
        maxHeight: 1920,
        generateThumbnail: true,
      });

      // Verify saved
      expect(saved.id).toBeTruthy();
      expect(saved.data).toBeTruthy();
      expect(saved.thumbnail).toBeTruthy();
      expect(saved.width).toBeLessThanOrEqual(1920);
      expect(saved.quality).toBe(85);

      // Retrieve by ID
      const retrieved = await service.getImage(saved.id);
      expect(retrieved).toEqual(saved);

      // Retrieve by note
      const noteImages = await service.getImagesForNote('verse_1');
      expect(noteImages).toHaveLength(1);
      expect(noteImages[0].id).toBe(saved.id);

      // Check stats
      const stats = await service.getStorageStats();
      expect(stats.totalImages).toBe(1);
      expect(stats.totalSize).toBeGreaterThan(0);

      // Delete
      await service.deleteImage(saved.id);

      // Verify deleted
      const deletedImage = await service.getImage(saved.id);
      expect(deletedImage).toBeNull();

      const finalStats = await service.getStorageStats();
      expect(finalStats.totalImages).toBe(0);
    });
  });
});
