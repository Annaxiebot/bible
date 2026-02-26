# Backup/Restore Test Plan

**Version**: 1.0  
**Date**: 2026-02-24  
**Target Coverage**: >90% for backup/restore services

## Test Organization

```
services/backup/__tests__/
  ├── MediaStorageService.test.ts
  ├── BackupService.test.ts
  ├── RestoreService.test.ts
  ├── BackupValidator.test.ts
  ├── FileLocationService.test.ts        # NEW
  ├── integration.test.ts
  └── fixtures/
      ├── sample-image.jpg
      ├── sample-image-large.jpg
      ├── backup-v3.0.json
      └── backup-v4.0.json

tests/e2e/
  ├── backup-restore.spec.ts
  └── backup-icloud.spec.ts             # NEW - iOS testing
```

## Unit Test Specifications

### MediaStorageService.test.ts

#### Test Suite: Image Storage

```typescript
describe('MediaStorageService - Image Storage', () => {
  
  test('should save image from File object', async () => {
    // Given: A File object
    const file = new File([...], 'test.jpg', { type: 'image/jpeg' });
    
    // When: Saving image
    const result = await mediaStorage.saveImage('note-1', file);
    
    // Then: Image saved with metadata
    expect(result.id).toBeDefined();
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.size).toBeGreaterThan(0);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
  
  test('should save image from base64 string', async () => {
    const base64 = 'data:image/png;base64,iVBORw0KG...';
    const result = await mediaStorage.saveImage('note-1', base64);
    
    expect(result.mimeType).toBe('image/png');
    expect(result.data).toBeDefined();
  });
  
  test('should compress large images', async () => {
    // Given: Large image (4000x3000)
    const largeImage = createTestImage(4000, 3000);
    
    // When: Saving with max dimensions
    const result = await mediaStorage.saveImage('note-1', largeImage, {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 0.85
    });
    
    // Then: Image compressed
    expect(result.width).toBeLessThanOrEqual(1920);
    expect(result.height).toBeLessThanOrEqual(1920);
    expect(result.originalSize).toBeGreaterThan(result.size);
  });
  
  test('should generate thumbnails', async () => {
    const image = createTestImage(1000, 800);
    const result = await mediaStorage.saveImage('note-1', image, {
      generateThumbnail: true
    });
    
    expect(result.thumbnail).toBeDefined();
    // Thumbnail should be much smaller
    expect(result.thumbnail!.length).toBeLessThan(result.data.length / 5);
  });
  
  test('should handle unsupported formats', async () => {
    const invalidFile = new File([...], 'test.bmp', { type: 'image/bmp' });
    
    await expect(
      mediaStorage.saveImage('note-1', invalidFile)
    ).rejects.toThrow('Unsupported image format');
  });
  
  test('should enforce size limits', async () => {
    // Create 10MB image
    const hugeImage = createTestImage(10000, 10000);
    
    await expect(
      mediaStorage.saveImage('note-1', hugeImage)
    ).rejects.toThrow('Image too large');
  });
});

describe('MediaStorageService - Retrieval', () => {
  
  test('should retrieve image by ID', async () => {
    const saved = await mediaStorage.saveImage('note-1', testImage);
    const retrieved = await mediaStorage.getImage(saved.id);
    
    expect(retrieved).toEqual(saved);
  });
  
  test('should return null for non-existent image', async () => {
    const result = await mediaStorage.getImage('non-existent-id');
    expect(result).toBeNull();
  });
  
  test('should retrieve all images for a note', async () => {
    await mediaStorage.saveImage('note-1', testImage1);
    await mediaStorage.saveImage('note-1', testImage2);
    await mediaStorage.saveImage('note-2', testImage3);
    
    const images = await mediaStorage.getImagesForNote('note-1');
    
    expect(images).toHaveLength(2);
    expect(images.every(img => img)).toBeTruthy();
  });
});

describe('MediaStorageService - Deletion', () => {
  
  test('should delete image by ID', async () => {
    const saved = await mediaStorage.saveImage('note-1', testImage);
    await mediaStorage.deleteImage(saved.id);
    
    const retrieved = await mediaStorage.getImage(saved.id);
    expect(retrieved).toBeNull();
  });
  
  test('should delete all images for a note', async () => {
    await mediaStorage.saveImage('note-1', testImage1);
    await mediaStorage.saveImage('note-1', testImage2);
    
    await mediaStorage.deleteImagesForNote('note-1');
    
    const images = await mediaStorage.getImagesForNote('note-1');
    expect(images).toHaveLength(0);
  });
  
  test('should cleanup orphaned images', async () => {
    // Create images
    await mediaStorage.saveImage('note-1', testImage1);
    await mediaStorage.saveImage('note-2', testImage2);
    await mediaStorage.saveImage('note-3', testImage3);
    
    // Delete notes 2 and 3 (making their images orphans)
    await verseDataStorage.deleteNote('note-2');
    await verseDataStorage.deleteNote('note-3');
    
    // Cleanup orphans
    const deleted = await mediaStorage.cleanupOrphans();
    
    expect(deleted).toBe(2);
  });
});

describe('MediaStorageService - Storage Stats', () => {
  
  test('should return storage statistics', async () => {
    await mediaStorage.saveImage('note-1', testImage1);
    await mediaStorage.saveImage('note-2', testImage2);
    
    const stats = await mediaStorage.getStorageStats();
    
    expect(stats.totalImages).toBe(2);
    expect(stats.totalSize).toBeGreaterThan(0);
    expect(stats.quotaUsed).toBeGreaterThan(0);
    expect(stats.quotaRemaining).toBeGreaterThan(0);
  });
  
  test('should detect quota exceeded', async () => {
    // Mock quota exceeded scenario
    vi.spyOn(navigator.storage, 'estimate').mockResolvedValue({
      usage: 1000000000,  // 1GB
      quota: 1000000000   // 1GB (100% used)
    });
    
    await expect(
      mediaStorage.saveImage('note-1', largeImage)
    ).rejects.toThrow('Storage quota exceeded');
  });
});
```

**Coverage Target**: 95%  
**Edge Cases**: 15+  
**Total Tests**: ~25

---

### BackupService.test.ts

```typescript
describe('BackupService - Creation', () => {
  
  test('should create backup with all data types', async () => {
    // Setup test data
    await createTestData();
    
    const result = await backupService.createBackup();
    
    expect(result.success).toBe(true);
    expect(result.data?.version).toBe('4.0');
    expect(result.data?.notes).toBeDefined();
    expect(result.data?.media).toBeDefined();
    expect(result.data?.metadata.totalImages).toBeGreaterThan(0);
  });
  
  test('should create selective backup', async () => {
    const result = await backupService.createBackup({
      includeNotes: true,
      includeBibleTexts: false,
      includeMedia: false
    });
    
    expect(result.data?.notes).toBeDefined();
    expect(result.data?.bibleTexts.chapters).toHaveLength(0);
    expect(result.data?.media.images).toHaveLength(0);
  });
  
  test('should report progress', async () => {
    const progressStages: string[] = [];
    
    await backupService.createBackup({
      onProgress: (stage, percent) => {
        progressStages.push(stage);
      }
    });
    
    expect(progressStages).toContain('Exporting notes...');
    expect(progressStages).toContain('Exporting media...');
    expect(progressStages).toContain('Building backup file...');
  });
  
  test('should compress images during backup', async () => {
    // Add large image
    const largeImage = createTestImage(3000, 2000);
    await addNoteWithImage('note-1', largeImage);
    
    const result = await backupService.createBackup({
      compressImages: true,
      imageQuality: 0.7
    });
    
    const originalSize = result.data!.media.images[0].originalSize!;
    const compressedSize = result.data!.media.images[0].size;
    
    expect(compressedSize).toBeLessThan(originalSize);
    expect(result.data!.metadata.compressionRatio).toBeGreaterThan(1);
  });
  
  test('should handle empty data', async () => {
    // No data in database
    const result = await backupService.createBackup();
    
    expect(result.success).toBe(true);
    expect(result.data?.metadata.totalNotes).toBe(0);
    expect(result.data?.metadata.totalImages).toBe(0);
  });
  
  test('should handle large datasets', async () => {
    // Create 1000 notes with 100 images
    await createLargeTestDataset(1000, 100);
    
    const result = await backupService.createBackup();
    
    expect(result.success).toBe(true);
    expect(result.data?.metadata.totalNotes).toBe(1000);
    expect(result.data?.metadata.totalImages).toBe(100);
  }, 30000); // 30s timeout
});

describe('BackupService - Validation', () => {
  
  test('should validate correct backup', async () => {
    const backup = await createValidBackup();
    const validation = await backupService.validateBackup(backup);
    
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
  
  test('should detect missing required fields', async () => {
    const invalidBackup = { version: '4.0' } as any;
    const validation = await backupService.validateBackup(invalidBackup);
    
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Missing required field: exportDate');
  });
  
  test('should detect corrupted media', async () => {
    const backup = await createValidBackup();
    backup.media.images[0].data = 'invalid-base64!!!';
    
    const validation = await backupService.validateBackup(backup);
    
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Invalid base64 encoding in media');
  });
});

describe('BackupService - File Export', () => {
  
  test('should export to file', async () => {
    const backup = await createValidBackup();
    
    // Mock download
    const downloadSpy = vi.spyOn(document, 'createElement');
    
    await backupService.exportToFile(backup);
    
    expect(downloadSpy).toHaveBeenCalledWith('a');
  });
  
  test('should use custom filename', async () => {
    const backup = await createValidBackup();
    
    await backupService.exportToFile(backup, 'my-backup.json');
    
    // Verify filename in download link
  });
});
```

**Coverage Target**: 95%  
**Edge Cases**: 12+  
**Total Tests**: ~20

---

### RestoreService.test.ts

```typescript
describe('RestoreService - v4.0 Restore', () => {
  
  test('should restore complete backup', async () => {
    const backup = await createTestBackup_v4();
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(backup)
    );
    
    expect(result.success).toBe(true);
    expect(result.imported.notes).toBeGreaterThan(0);
    expect(result.imported.images).toBeGreaterThan(0);
  });
  
  test('should restore with replace strategy', async () => {
    // Create existing data
    await createExistingNote('note-1', 'Original text');
    
    // Restore with newer note
    const backup = createBackupWithNote('note-1', 'Updated text');
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(backup),
      { notesStrategy: 'replace' }
    );
    
    // Verify replaced
    const note = await verseDataStorage.getNote('note-1');
    expect(note.personalNote.text).toBe('Updated text');
  });
  
  test('should restore with merge strategy', async () => {
    await createExistingNote('note-1', 'Original');
    await createExistingNote('note-2', 'Original');
    
    const backup = createBackupWithNote('note-2', 'Updated');
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(backup),
      { notesStrategy: 'merge_combine' }
    );
    
    expect(result.imported.notes).toBe(1);  // note-2 merged
    expect(result.skipped.notes).toBe(0);
  });
  
  test('should restore with skip_existing strategy', async () => {
    await createExistingNote('note-1', 'Original');
    
    const backup = createBackupWithNote('note-1', 'Updated');
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(backup),
      { notesStrategy: 'skip_existing' }
    );
    
    expect(result.skipped.notes).toBe(1);
    
    const note = await verseDataStorage.getNote('note-1');
    expect(note.personalNote.text).toBe('Original');  // Not changed
  });
  
  test('should report progress', async () => {
    const backup = createLargeBackup();
    const progressStages: string[] = [];
    
    await restoreService.restoreFromBackup(
      JSON.stringify(backup),
      {
        onProgress: (stage, percent) => {
          progressStages.push(stage);
        }
      }
    );
    
    expect(progressStages).toContain('Importing notes...');
    expect(progressStages).toContain('Importing media...');
  });
  
  test('should restore images', async () => {
    const backup = createBackupWithImages(['img-1', 'img-2']);
    
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(backup)
    );
    
    expect(result.imported.images).toBe(2);
    
    // Verify images in storage
    const images = await mediaStorage.getAllImages();
    expect(images).toHaveLength(2);
  });
  
  test('should handle corrupted backup gracefully', async () => {
    const result = await restoreService.restoreFromBackup(
      'invalid json!!!'
    );
    
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Parse error');
  });
  
  test('should rollback on failure', async () => {
    // Create existing data
    await createExistingNote('note-1', 'Original');
    
    // Attempt to restore corrupted backup
    const corruptedBackup = createCorruptedBackup();
    
    await expect(
      restoreService.restoreFromBackup(JSON.stringify(corruptedBackup))
    ).rejects.toThrow();
    
    // Verify original data preserved
    const note = await verseDataStorage.getNote('note-1');
    expect(note.personalNote.text).toBe('Original');
  });
});

describe('RestoreService - Version Migration', () => {
  
  test('should migrate v3.0 to v4.0', async () => {
    const v3Backup = createTestBackup_v3();
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(v3Backup)
    );
    
    expect(result.success).toBe(true);
    // v3 has no images
    expect(result.imported.images).toBe(0);
  });
  
  test('should migrate v2.0 to v4.0', async () => {
    const v2Backup = createTestBackup_v2();
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(v2Backup)
    );
    
    expect(result.success).toBe(true);
  });
  
  test('should migrate v1.0 to v4.0', async () => {
    const v1Backup = createTestBackup_v1();
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(v1Backup)
    );
    
    expect(result.success).toBe(true);
  });
});

describe('RestoreService - Validation', () => {
  
  test('should validate backup before import', async () => {
    const invalidBackup = { version: '99.0' };
    
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(invalidBackup)
    );
    
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Unsupported version');
  });
  
  test('should detect size limit violations', async () => {
    const hugeBackup = createHugeBackup(150); // 150MB
    
    const validation = await restoreService.validateBackupFile(
      JSON.stringify(hugeBackup)
    );
    
    expect(validation.warnings).toContain('Backup exceeds recommended size');
  });
});

describe('RestoreService - Dry Run', () => {
  
  test('should validate without importing', async () => {
    const backup = createTestBackup_v4();
    
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(backup),
      { dryRun: true }
    );
    
    expect(result.success).toBe(true);
    expect(result.imported.notes).toBe(0);  // Not actually imported
    
    // Verify no data added
    const allNotes = await verseDataStorage.getAllData();
    expect(allNotes).toHaveLength(0);
  });
});
```

**Coverage Target**: 95%  
**Edge Cases**: 15+  
**Total Tests**: ~25

---

### BackupValidator.test.ts

```typescript
describe('BackupValidator - Structure', () => {
  test('should validate correct structure', () => {
    const backup = createValidBackup_v4();
    const result = BackupValidator.validateStructure(backup);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  test('should detect missing version', () => {
    const backup = { exportDate: '2024-01-01' } as any;
    const result = BackupValidator.validateStructure(backup);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing version field');
  });
  
  test('should detect invalid version', () => {
    const backup = { version: '5.0' } as any;
    const result = BackupValidator.validateStructure(backup);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unsupported version: 5.0');
  });
});

describe('BackupValidator - Media', () => {
  test('should validate media attachments', () => {
    const media = [createValidMediaAttachment()];
    const result = BackupValidator.validateMedia(media);
    
    expect(result.valid).toBe(true);
  });
  
  test('should detect invalid base64', () => {
    const media = [{ ...createValidMediaAttachment(), data: 'not-base64!!!' }];
    const result = BackupValidator.validateMedia(media);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid base64 encoding');
  });
  
  test('should detect oversized images', () => {
    const media = [{ ...createValidMediaAttachment(), size: 20000000 }]; // 20MB
    const result = BackupValidator.validateMedia(media);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Image exceeds size limit');
  });
});

describe('BackupValidator - References', () => {
  test('should validate all references', () => {
    const backup = createBackupWithReferences();
    const result = BackupValidator.validateReferences(backup);
    
    expect(result.valid).toBe(true);
  });
  
  test('should detect orphaned media references', () => {
    const backup = createBackupWithOrphanedMedia();
    const result = BackupValidator.validateReferences(backup);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Orphaned media reference found');
  });
});
```

**Coverage Target**: 95%  
**Total Tests**: ~15

---

## Integration Tests

### integration.test.ts

```typescript
describe('Backup/Restore Integration', () => {
  
  test('Full Cycle: Create → Backup → Clear → Restore → Verify', async () => {
    // 1. Create test data
    await createNote('gen-1-1', 'In the beginning...');
    await addImageToNote('gen-1-1', testImage);
    await createBookmark('gen-1');
    
    // 2. Create backup
    const backupResult = await backupService.createBackup();
    expect(backupResult.success).toBe(true);
    
    const backup = backupResult.data!;
    expect(backup.metadata.totalNotes).toBe(1);
    expect(backup.metadata.totalImages).toBe(1);
    
    // 3. Clear all data
    await clearAllData();
    
    const allData = await verseDataStorage.getAllData();
    expect(allData).toHaveLength(0);
    
    // 4. Restore from backup
    const restoreResult = await restoreService.restoreFromBackup(
      JSON.stringify(backup)
    );
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.imported.notes).toBe(1);
    expect(restoreResult.imported.images).toBe(1);
    
    // 5. Verify data restored correctly
    const restoredNote = await verseDataStorage.getNote('gen-1-1');
    expect(restoredNote.personalNote.text).toBe('In the beginning...');
    expect(restoredNote.personalNote.media).toHaveLength(1);
    
    const restoredImages = await mediaStorage.getImagesForNote('gen-1-1');
    expect(restoredImages).toHaveLength(1);
  });
  
  test('Large Dataset: 100 notes + 50 images', async () => {
    // Create large dataset
    await createLargeDataset(100, 50);
    
    // Backup
    const backupResult = await backupService.createBackup();
    expect(backupResult.success).toBe(true);
    
    // Clear
    await clearAllData();
    
    // Restore
    const restoreResult = await restoreService.restoreFromBackup(
      JSON.stringify(backupResult.data!)
    );
    
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.imported.notes).toBe(100);
    expect(restoreResult.imported.images).toBe(50);
  }, 60000); // 60s timeout
  
  test('Version Migration: v3.0 → v4.0', async () => {
    const v3Backup = loadFixture('backup-v3.0.json');
    
    const result = await restoreService.restoreFromBackup(v3Backup);
    
    expect(result.success).toBe(true);
    
    // Create new backup in v4.0 format
    const v4Backup = await backupService.createBackup();
    expect(v4Backup.data?.version).toBe('4.0');
  });
  
  test('Merge Strategy: Combine existing + new data', async () => {
    // Create existing data
    await createNote('note-1', 'Old text');
    await createNote('note-2', 'Old text');
    
    // Create backup with updates
    const backup = createBackupWith([
      { id: 'note-2', text: 'Updated text' },
      { id: 'note-3', text: 'New note' }
    ]);
    
    // Restore with merge
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(backup),
      { notesStrategy: 'merge_combine' }
    );
    
    // Verify final state
    expect(await verseDataStorage.getAllData()).toHaveLength(3);
  });
  
  test('Error Recovery: Corrupted backup → Rollback', async () => {
    // Create existing data
    await createNote('note-1', 'Original');
    
    // Attempt corrupted restore
    const corruptedBackup = createPartiallyCorruptedBackup();
    
    const result = await restoreService.restoreFromBackup(
      JSON.stringify(corruptedBackup)
    );
    
    expect(result.success).toBe(false);
    
    // Verify original data intact
    const note = await verseDataStorage.getNote('note-1');
    expect(note.personalNote.text).toBe('Original');
  });
});
```

**Total Tests**: ~5 comprehensive integration tests

---

## E2E Test Specifications

### tests/e2e/backup-restore.spec.ts

```typescript
import { test, expect } from '@playwright/test';

test.describe('Backup/Restore E2E', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear existing data
    await page.evaluate(() => localStorage.clear());
  });
  
  test('User creates backup with images', async ({ page }) => {
    // 1. Navigate to a chapter
    await page.click('[data-testid="book-genesis"]');
    await page.click('[data-testid="chapter-1"]');
    
    // 2. Add a note
    await page.click('[data-testid="add-note"]');
    await page.fill('[data-testid="note-editor"]', 'My first note');
    
    // 3. Upload an image
    await page.setInputFiles(
      '[data-testid="image-upload"]',
      'tests/fixtures/sample-image.jpg'
    );
    
    await page.click('[data-testid="save-note"]');
    
    // 4. Create backup
    await page.click('[data-testid="menu"]');
    await page.click('[data-testid="export-import"]');
    await page.click('[data-testid="create-backup"]');
    
    // 5. Wait for download
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="download-backup"]');
    const download = await downloadPromise;
    
    // 6. Verify filename
    expect(download.suggestedFilename()).toMatch(/bible-app-backup-.*\.json/);
    
    // 7. Verify backup content
    const path = await download.path();
    const content = await fs.readFile(path, 'utf-8');
    const backup = JSON.parse(content);
    
    expect(backup.version).toBe('4.0');
    expect(backup.metadata.totalNotes).toBe(1);
    expect(backup.metadata.totalImages).toBe(1);
  });
  
  test('User restores backup', async ({ page }) => {
    // 1. Navigate to import
    await page.click('[data-testid="menu"]');
    await page.click('[data-testid="export-import"]');
    await page.click('[data-testid="restore-backup"]');
    
    // 2. Upload backup file
    await page.setInputFiles(
      '[data-testid="backup-file-input"]',
      'tests/fixtures/backup-v4.0.json'
    );
    
    // 3. Review summary
    await page.waitForSelector('[data-testid="restore-summary"]');
    expect(await page.textContent('[data-testid="notes-count"]')).toBe('5');
    expect(await page.textContent('[data-testid="images-count"]')).toBe('3');
    
    // 4. Select merge strategy
    await page.selectOption(
      '[data-testid="merge-strategy"]',
      'merge_combine'
    );
    
    // 5. Confirm restore
    await page.click('[data-testid="confirm-restore"]');
    
    // 6. Wait for completion
    await page.waitForSelector('[data-testid="restore-complete"]');
    
    // 7. Verify data restored
    await page.click('[data-testid="notes-list"]');
    const notes = await page.locator('[data-testid^="note-"]').count();
    expect(notes).toBe(5);
  });
  
  test('User handles large backup', async ({ page }) => {
    // Upload large backup (50MB)
    await page.setInputFiles(
      '[data-testid="backup-file-input"]',
      'tests/fixtures/large-backup.json'
    );
    
    // Should show warning
    await page.waitForSelector('[data-testid="size-warning"]');
    expect(await page.textContent('[data-testid="size-warning"]'))
      .toContain('large backup');
    
    // Progress indicator should appear
    await page.click('[data-testid="confirm-restore"]');
    await page.waitForSelector('[data-testid="progress-bar"]');
    
    // Should complete successfully
    await page.waitForSelector(
      '[data-testid="restore-complete"]',
      { timeout: 60000 }
    );
  });
  
  test('User handles invalid backup file', async ({ page }) => {
    // Upload invalid file
    await page.setInputFiles(
      '[data-testid="backup-file-input"]',
      'tests/fixtures/invalid-backup.txt'
    );
    
    // Should show error
    await page.waitForSelector('[data-testid="error-message"]');
    expect(await page.textContent('[data-testid="error-message"]'))
      .toContain('Invalid backup file');
  });
  
  test('User views backup summary before restoring', async ({ page }) => {
    await page.setInputFiles(
      '[data-testid="backup-file-input"]',
      'tests/fixtures/backup-v3.0.json'
    );
    
    // Summary should show migration notice
    await page.waitForSelector('[data-testid="migration-notice"]');
    expect(await page.textContent('[data-testid="migration-notice"]'))
      .toContain('v3.0');
  });
});

test.describe('Cross-browser compatibility', () => {
  
  test('Backup/restore works in Chrome', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium');
    // Test implementation
  });
  
  test('Backup/restore works in Firefox', async ({ page, browserName }) => {
    test.skip(browserName !== 'firefox');
    // Test implementation
  });
  
  test('Backup/restore works in Safari', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit');
    // Test implementation
  });
});
```

**Total E2E Tests**: ~10 tests

---

## Test Fixtures

### backup-v3.0.json
```json
{
  "version": "3.0",
  "exportDate": "2024-01-01T00:00:00Z",
  "notes": {...},
  "bibleTexts": {...},
  "annotations": [...],
  "bookmarks": [...],
  "readingHistory": {...},
  "readingPlans": [...]
}
```

### backup-v4.0.json
```json
{
  "version": "4.0",
  "exportDate": "2024-01-01T00:00:00Z",
  "notes": {...},
  "bibleTexts": {...},
  "annotations": [...],
  "bookmarks": [...],
  "readingHistory": {...},
  "readingPlans": [...],
  "media": {
    "images": [
      {
        "id": "img-1",
        "type": "image",
        "data": "data:image/jpeg;base64,...",
        "mimeType": "image/jpeg",
        "size": 12345,
        "width": 800,
        "height": 600,
        "timestamp": 1704067200000
      }
    ]
  },
  "metadata": {
    "totalNotes": 5,
    "totalImages": 3,
    "totalMediaSize": 1234567
  }
}
```

---

## Performance Benchmarks

### Target Metrics

| Operation | Dataset | Target Time | Max Time |
|-----------|---------|-------------|----------|
| Save image | 1 image (2MB) | < 500ms | 1s |
| Generate thumbnail | 1 image | < 200ms | 500ms |
| Create backup | 100 notes + 50 images | < 10s | 20s |
| Restore backup | 100 notes + 50 images | < 15s | 30s |
| Compress image | 1 image (4000x3000) | < 500ms | 1s |
| Cleanup orphans | 100 images | < 2s | 5s |

### Load Testing

```typescript
describe('Performance Tests', () => {
  
  test('should handle 1000 notes efficiently', async () => {
    const start = Date.now();
    
    await createLargeDataset(1000, 0);
    const backupResult = await backupService.createBackup();
    
    const duration = Date.now() - start;
    
    expect(backupResult.success).toBe(true);
    expect(duration).toBeLessThan(15000); // 15s
  });
  
  test('should handle 200 images efficiently', async () => {
    const start = Date.now();
    
    await createLargeDataset(200, 200);
    const backupResult = await backupService.createBackup();
    
    const duration = Date.now() - start;
    
    expect(backupResult.success).toBe(true);
    expect(duration).toBeLessThan(30000); // 30s
  });
});
```

---

## Coverage Requirements

### Overall Coverage Target: >90%

**Per-file targets:**
- MediaStorageService.ts: >95%
- BackupService.ts: >95%
- RestoreService.ts: >95%
- BackupValidator.ts: >95%
- exportImportService.ts: >85% (legacy code)

### Coverage Commands

```bash
# Run with coverage
npm run test:coverage

# View coverage report
open coverage/index.html

# Check coverage thresholds
npm run test:coverage -- --coverage.threshold.lines=90
```

---

## Test Execution Order

### Development Workflow

1. **Write failing test** (TDD)
2. **Implement feature**
3. **Run unit tests**
   ```bash
   npm run test:watch
   ```
4. **Check coverage**
   ```bash
   npm run test:coverage
   ```
5. **Run integration tests**
6. **Run E2E tests**
   ```bash
   npm run test:e2e
   ```
7. **All tests pass** → Commit

### CI/CD Pipeline

```yaml
# .github/workflows/test.yml
- name: Unit Tests
  run: npm run test

- name: E2E Tests
  run: npm run test:e2e

- name: Coverage Check
  run: npm run test:coverage -- --coverage.threshold.lines=90

- name: Build
  run: npm run build
```

---

## Manual Testing Checklist

After automated tests pass, manually verify:

### Backup
- [ ] Create backup with various data combinations
- [ ] Verify file downloads correctly
- [ ] Open backup file in text editor (valid JSON)
- [ ] Check file size is reasonable
- [ ] Progress indicator works smoothly

### Restore
- [ ] Upload v4.0 backup file
- [ ] Upload v3.0 backup file (migration)
- [ ] Test all merge strategies
- [ ] Verify images display correctly
- [ ] Check thumbnails load
- [ ] Verify restore summary is accurate

### Edge Cases
- [ ] Very large image (5MB)
- [ ] Many small images (100+)
- [ ] Corrupted backup file
- [ ] Partial backup
- [ ] Storage quota exceeded
- [ ] Slow network
- [ ] Browser refresh during backup/restore

---

## Success Criteria

### Required for Merge

- ✅ All unit tests passing
- ✅ All integration tests passing
- ✅ All E2E tests passing
- ✅ Coverage >90% for backup/restore code
- ✅ `npm run build` succeeds
- ✅ No console errors
- ✅ Manual testing checklist complete
- ✅ Documentation updated

### Quality Gates

- ✅ No `any` types
- ✅ All functions documented (JSDoc)
- ✅ Error handling tested
- ✅ Edge cases covered
- ✅ Performance benchmarks met
- ✅ No memory leaks
- ✅ Backward compatibility verified

---

**Test Plan created by**: Claude (AI Agent)  
**Date**: 2026-02-24  
**Status**: Ready for implementation
