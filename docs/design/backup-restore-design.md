# Backup/Restore with Images - Design Document

**Version**: 1.0  
**Date**: 2026-02-24  
**Status**: Design Phase  
**Target**: v4.0 Backup Format

## Overview

This document outlines the design for enhancing the Bible app's backup/restore feature to include media attachments (images), following modular, reusable design principles with comprehensive testing.

## Goals

### Primary Goals
1. ✅ Include images in backup/restore
2. ✅ Maintain backward compatibility (can import v3.0 backups)
3. ✅ Modular, testable architecture
4. ✅ >90% test coverage for backup/restore code
5. ✅ Handle large backups gracefully

### Non-Goals (Out of Scope)
- ❌ Cloud storage/sync (use existing Google Drive sync)
- ❌ Video/audio attachments (images only for now)
- ❌ Real-time collaboration
- ❌ Encryption (can be added later)

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────┐
│                    UI Layer                         │
│  (ExportImportUI, MediaUploader, ProgressDialog)    │
└───────────────┬─────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────┐
│              Service Orchestrator                   │
│         (exportImportService.ts)                    │
│  - Coordinates backup/restore workflow              │
│  - Handles UI callbacks                             │
│  - Manages transactions                             │
└────┬─────────┬─────────────┬────────────────────────┘
     │         │             │
     │         │             │
┌────▼────┐ ┌──▼─────────┐ ┌▼────────────────────┐
│ Backup  │ │  Restore   │ │  MediaStorage       │
│ Service │ │  Service   │ │  Service            │
│         │ │            │ │                     │
│ - Build │ │ - Validate │ │ - Store images      │
│ - Export│ │ - Parse    │ │ - Retrieve images   │
│ - Stream│ │ - Merge    │ │ - Generate thumbs   │
└─────────┘ └────────────┘ │ - Compress          │
                           │ - Delete orphans    │
                           └─────────────────────┘
```

### File Structure

```
services/
  ├── backup/
  │   ├── BackupService.ts           # NEW - Build and export backups
  │   ├── RestoreService.ts          # NEW - Import and merge backups
  │   ├── MediaStorageService.ts     # NEW - Image storage/retrieval
  │   ├── BackupValidator.ts         # NEW - Validate backup files
  │   ├── types.ts                   # NEW - Backup-specific types
  │   └── __tests__/
  │       ├── BackupService.test.ts
  │       ├── RestoreService.test.ts
  │       ├── MediaStorageService.test.ts
  │       └── integration.test.ts
  │
  └── exportImportService.ts         # UPDATED - Thin orchestrator

types/
  └── verseData.ts                    # UPDATED - Enhance MediaAttachment

tests/
  ├── e2e/
  │   └── backup-restore.spec.ts     # NEW - E2E tests
  └── fixtures/
      ├── backup-v3.0.json           # NEW - Test fixtures
      ├── backup-v4.0.json           # NEW
      └── sample-images/             # NEW
```

## Data Structures

### Enhanced MediaAttachment (v4.0)

```typescript
export interface MediaAttachment {
  id: string;                    // UUID
  type: 'image' | 'audio' | 'video';
  
  // Storage
  data: string;                  // base64 encoded image data
  mimeType: string;              // e.g., 'image/jpeg', 'image/png'
  size: number;                  // bytes
  
  // Thumbnails
  thumbnail?: string;            // base64 encoded thumbnail (max 150x150)
  
  // Metadata
  caption?: string;
  filename?: string;             // original filename
  timestamp: number;             // when added
  
  // Dimensions (for images)
  width?: number;
  height?: number;
  
  // Compression info
  originalSize?: number;         // pre-compression size
  quality?: number;              // compression quality (0-100)
}
```

### Backup Format v4.0

```typescript
export interface FullBackupExport_v4 {
  version: '4.0';
  exportDate: string;
  deviceId?: string;
  
  // Existing data
  notes: BibleNotesExport;
  bibleTexts: BibleTextExport;
  annotations: AnnotationRecord[];
  bookmarks: Bookmark[];
  readingHistory: {...};
  readingPlans: ReadingPlanState[];
  
  // NEW: Media attachments
  media: {
    images: MediaAttachment[];
    // Future: audio, video
  };
  
  // Enhanced metadata
  metadata: {
    totalNotes: number;
    totalResearch: number;
    totalAnnotations: number;
    totalBookmarks: number;
    totalHistoryEntries: number;
    totalPlans: number;
    totalImages: number;          // NEW
    totalMediaSize: number;       // NEW - total bytes
    backupSize: number;           // NEW - total backup size
    compressionRatio?: number;    // NEW - if compressed
  };
}
```

## Service Specifications

### 1. MediaStorageService

**Responsibilities:**
- Store images in IndexedDB
- Retrieve images by ID
- Generate thumbnails
- Compress images
- Delete images
- Clean up orphaned images

**API:**

```typescript
class MediaStorageService {
  // Store image from File, Blob, or base64
  async saveImage(
    noteId: string,
    file: File | Blob | string,
    options?: {
      maxWidth?: number;      // default: 1920
      maxHeight?: number;     // default: 1920
      quality?: number;       // default: 0.85
      generateThumbnail?: boolean;  // default: true
    }
  ): Promise<MediaAttachment>;
  
  // Retrieve image
  async getImage(imageId: string): Promise<MediaAttachment | null>;
  
  // Get all images for a note
  async getImagesForNote(noteId: string): Promise<MediaAttachment[]>;
  
  // Delete image
  async deleteImage(imageId: string): Promise<void>;
  
  // Delete all images for a note
  async deleteImagesForNote(noteId: string): Promise<void>;
  
  // Get storage stats
  async getStorageStats(): Promise<{
    totalImages: number;
    totalSize: number;
    quotaUsed: number;
    quotaRemaining: number;
  }>;
  
  // Cleanup orphaned images (images not referenced by any note)
  async cleanupOrphans(): Promise<number>;
  
  // Internal: Generate thumbnail
  private async generateThumbnail(
    data: string,
    maxWidth: number,
    maxHeight: number
  ): Promise<string>;
  
  // Internal: Compress image
  private async compressImage(
    data: string,
    maxWidth: number,
    maxHeight: number,
    quality: number
  ): Promise<{
    data: string;
    width: number;
    height: number;
    size: number;
  }>;
}
```

**IndexedDB Schema:**

```typescript
interface MediaDB extends DBSchema {
  media: {
    key: string;  // imageId
    value: {
      id: string;
      noteId: string;      // Reference to note
      type: 'image' | 'audio' | 'video';
      data: string;        // base64
      thumbnail?: string;
      mimeType: string;
      size: number;
      width?: number;
      height?: number;
      caption?: string;
      filename?: string;
      timestamp: number;
      originalSize?: number;
      quality?: number;
    };
    indexes: {
      'by-note': string;   // noteId
      'by-timestamp': number;
    };
  };
}
```

### 2. BackupService

**Responsibilities:**
- Build backup export
- Validate data integrity
- Report progress
- Handle large datasets
- Generate metadata

**API:**

```typescript
interface BackupOptions {
  includeNotes?: boolean;          // default: true
  includeBibleTexts?: boolean;     // default: true
  includeAnnotations?: boolean;    // default: true
  includeBookmarks?: boolean;      // default: true
  includeHistory?: boolean;        // default: true
  includePlans?: boolean;          // default: true
  includeMedia?: boolean;          // default: true
  
  compressImages?: boolean;        // default: true
  imageQuality?: number;           // default: 0.85
  
  onProgress?: ProgressCallback;
}

type ProgressCallback = (stage: string, percent: number, message?: string) => void;

interface BackupResult {
  success: boolean;
  data?: FullBackupExport_v4;
  size?: number;
  error?: string;
}

class BackupService {
  async createBackup(options?: BackupOptions): Promise<BackupResult>;
  
  async exportToFile(
    backup: FullBackupExport_v4,
    filename?: string
  ): Promise<void>;
  
  async validateBackup(
    backup: FullBackupExport_v4
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }>;
  
  // Get summary without creating full backup
  async getBackupSummary(): Promise<BackupSummaryData>;
}
```

### 3. RestoreService

**Responsibilities:**
- Parse and validate backup files
- Merge strategies (replace, merge, skip)
- Handle version migrations
- Report progress
- Rollback on failure

**API:**

```typescript
interface RestoreOptions {
  notesStrategy?: MergeStrategy;        // default: 'merge_combine'
  textsStrategy?: MergeStrategy;        // default: 'skip_existing'
  annotationsStrategy?: MergeStrategy;  // default: 'merge_combine'
  bookmarksStrategy?: MergeStrategy;    // default: 'skip_existing'
  historyStrategy?: MergeStrategy;      // default: 'merge_combine'
  plansStrategy?: MergeStrategy;        // default: 'skip_existing'
  mediaStrategy?: MergeStrategy;        // default: 'skip_existing'
  
  onProgress?: ProgressCallback;
  
  // Safety options
  dryRun?: boolean;                     // Validate only, don't import
  createBackupBefore?: boolean;         // Create backup before restore
}

interface RestoreResult {
  success: boolean;
  imported: {
    notes: number;
    texts: number;
    annotations: number;
    bookmarks: number;
    history: number;
    plans: number;
    images: number;
  };
  skipped: {
    notes: number;
    texts: number;
    annotations: number;
    bookmarks: number;
    history: number;
    plans: number;
    images: number;
  };
  errors: string[];
}

class RestoreService {
  async restoreFromBackup(
    backupJson: string,
    options?: RestoreOptions
  ): Promise<RestoreResult>;
  
  async parseBackupFile(
    file: File | string
  ): Promise<FullBackupExport_v4 | null>;
  
  async getBackupSummary(
    backupJson: string
  ): Promise<BackupSummaryData>;
  
  async validateBackupFile(
    backupJson: string
  ): Promise<{
    valid: boolean;
    version: string;
    errors: string[];
    warnings: string[];
  }>;
  
  // Internal: Migrate older formats to v4.0
  private async migrateBackup(
    backup: any
  ): Promise<FullBackupExport_v4>;
}
```

### 4. BackupValidator

**Responsibilities:**
- Validate backup file structure
- Check data integrity
- Verify references
- Size limits

**API:**

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats?: {
    totalSize: number;
    imageCount: number;
    averageImageSize: number;
    largestImage: number;
  };
}

class BackupValidator {
  static validateStructure(backup: any): ValidationResult;
  
  static validateMedia(media: MediaAttachment[]): ValidationResult;
  
  static validateReferences(backup: FullBackupExport_v4): ValidationResult;
  
  static checkSizeLimits(
    backup: FullBackupExport_v4,
    maxSize?: number
  ): ValidationResult;
}
```

## Implementation Plan

### Phase 1: MediaStorageService ✅ FIRST
**Priority**: Critical foundation  
**Estimated effort**: 2-3 days

**Tasks:**
1. Create `services/backup/` directory
2. Implement MediaStorageService.ts
3. Create IndexedDB schema
4. Implement image compression
5. Implement thumbnail generation
6. Write unit tests (target: 95% coverage)
   - Test image upload
   - Test compression
   - Test thumbnail generation
   - Test retrieval
   - Test deletion
   - Test orphan cleanup
   - Test storage limits

**Acceptance criteria:**
- ✅ All unit tests passing
- ✅ Coverage >95%
- ✅ Can store/retrieve images
- ✅ Thumbnails generated correctly
- ✅ Compression works
- ✅ Build succeeds

### Phase 2: BackupService
**Priority**: High  
**Estimated effort**: 2-3 days

**Tasks:**
1. Implement BackupService.ts
2. Implement BackupValidator.ts
3. Create backup/types.ts
4. Update exportImportService to use BackupService
5. Write unit tests (target: 95% coverage)
   - Test backup creation
   - Test each data type inclusion
   - Test progress callbacks
   - Test validation
   - Test error handling
   - Test large datasets

**Acceptance criteria:**
- ✅ All unit tests passing
- ✅ Coverage >95%
- ✅ Can create v4.0 backups
- ✅ Validation works
- ✅ Progress reporting works
- ✅ Build succeeds

### Phase 3: RestoreService
**Priority**: High  
**Estimated effort**: 2-3 days

**Tasks:**
1. Implement RestoreService.ts
2. Implement version migration (v3.0 → v4.0)
3. Implement merge strategies
4. Update exportImportService to use RestoreService
5. Write unit tests (target: 95% coverage)
   - Test v4.0 restore
   - Test v3.0 migration
   - Test each merge strategy
   - Test validation
   - Test error handling
   - Test rollback

**Acceptance criteria:**
- ✅ All unit tests passing
- ✅ Coverage >95%
- ✅ Can restore v4.0 backups
- ✅ Can migrate v3.0 backups
- ✅ All merge strategies work
- ✅ Build succeeds

### Phase 4: Integration Tests
**Priority**: Critical  
**Estimated effort**: 1-2 days

**Tasks:**
1. Create integration tests
   - Full backup/restore cycle
   - Large dataset testing
   - Edge cases
   - Error scenarios
2. Test backward compatibility
3. Test with real data

**Acceptance criteria:**
- ✅ All integration tests passing
- ✅ v3.0 → v4.0 migration verified
- ✅ Full cycle works
- ✅ Build succeeds

### Phase 5: UI Components (Out of scope for this task)
**Priority**: Medium  
**Note**: This task focuses on backend/service layer only

### Phase 6: E2E Tests
**Priority**: High  
**Estimated effort**: 2 days

**Tasks:**
1. Create e2e/backup-restore.spec.ts
2. Test user workflows
   - Create backup
   - Restore backup
   - Handle errors
3. Test with different browsers

**Acceptance criteria:**
- ✅ All E2E tests passing
- ✅ Works in Chrome/Firefox/Safari
- ✅ Build succeeds

### Phase 7: Documentation
**Priority**: High  
**Estimated effort**: 1 day

**Tasks:**
1. API documentation (JSDoc)
2. Update README
3. Create migration guide
4. Create troubleshooting guide

**Acceptance criteria:**
- ✅ All public APIs documented
- ✅ README updated
- ✅ Migration guide complete

## Test Strategy

### Unit Tests (>90% coverage required)

**MediaStorageService:**
- ✅ Image upload (File, Blob, base64)
- ✅ Image retrieval
- ✅ Compression (various quality levels)
- ✅ Thumbnail generation
- ✅ Deletion (single, bulk, orphans)
- ✅ Storage stats
- ✅ Error handling (quota exceeded, invalid data)

**BackupService:**
- ✅ Backup creation (all options)
- ✅ Progress reporting
- ✅ Validation
- ✅ Large datasets
- ✅ Error handling
- ✅ Metadata generation

**RestoreService:**
- ✅ v4.0 restore
- ✅ v3.0 migration
- ✅ Merge strategies (all 4)
- ✅ Validation
- ✅ Error handling
- ✅ Progress reporting

**BackupValidator:**
- ✅ Structure validation
- ✅ Media validation
- ✅ Reference validation
- ✅ Size limit checks

### Integration Tests

1. **Full Backup/Restore Cycle**
   - Create data → Backup → Clear → Restore → Verify

2. **Version Migration**
   - Import v3.0 → Verify migrated to v4.0

3. **Large Dataset**
   - 1000+ notes, 100+ images → Backup → Restore

4. **Merge Strategies**
   - Test each strategy with conflicts

5. **Error Recovery**
   - Corrupted backup → Graceful failure
   - Partial restore → Rollback

### E2E Tests

1. **User Workflow: Create Backup**
   - Add notes with images
   - Export backup
   - Verify file downloaded

2. **User Workflow: Restore Backup**
   - Import backup file
   - Select merge strategy
   - Verify data restored

3. **Edge Cases**
   - Very large images
   - Invalid file
   - Storage quota exceeded

### Performance Benchmarks

- Backup 100 notes with 50 images: < 10 seconds
- Restore 100 notes with 50 images: < 15 seconds
- Compression: < 500ms per image
- Thumbnail generation: < 200ms per image

## Error Handling

### Error Categories

1. **Validation Errors**
   - Invalid backup format
   - Unsupported version
   - Missing required fields
   - Corrupted data

2. **Storage Errors**
   - Quota exceeded
   - IndexedDB failure
   - Permission denied

3. **Processing Errors**
   - Image compression failed
   - Large file timeout
   - Memory exceeded

### Error Recovery Strategy

```typescript
// Transactional restore with rollback
async restoreWithRollback(backup: FullBackupExport_v4): Promise<RestoreResult> {
  // 1. Create pre-restore backup
  const preRestoreBackup = await this.createBackup();
  
  try {
    // 2. Validate backup
    const validation = await this.validateBackup(backup);
    if (!validation.valid) {
      throw new Error(`Invalid backup: ${validation.errors.join(', ')}`);
    }
    
    // 3. Restore data
    const result = await this.restoreData(backup);
    
    // 4. Verify restoration
    await this.verifyRestore(backup, result);
    
    return result;
    
  } catch (error) {
    // 5. Rollback on failure
    console.error('Restore failed, rolling back:', error);
    await this.restoreData(preRestoreBackup);
    throw error;
  }
}
```

## Size and Performance Considerations

### Image Size Limits

- **Max dimensions**: 1920x1920 (configurable)
- **Max file size**: 5MB per image (before compression)
- **Compression quality**: 0.85 (JPEG)
- **Thumbnail size**: 150x150

### Backup Size Limits

- **Soft limit**: 50MB (show warning)
- **Hard limit**: 100MB (prevent export)
- **Recommendation**: Split into multiple backups if needed

### IndexedDB Quotas

- **Minimum**: 50MB (most browsers)
- **Typical**: 500MB - 1GB
- **Request persistent storage** for better quotas

### Optimization Strategies

1. **Lazy Loading**
   - Don't load all images at once
   - Stream large backups

2. **Compression**
   - JPEG for photos (quality 0.85)
   - PNG for screenshots (if smaller)
   - WebP if supported

3. **Chunking**
   - Process images in batches
   - Avoid blocking UI

4. **Cleanup**
   - Delete orphaned images periodically
   - Compress old images further

## Backward Compatibility

### Migration Path

```
v1.0 (notes only)
  ↓
v2.0 (notes + bible texts)
  ↓
v3.0 (notes + texts + annotations + bookmarks + history + plans)
  ↓
v4.0 (all of above + media)
```

### Import Support

- ✅ v4.0: Full support
- ✅ v3.0: Auto-migrate to v4.0
- ✅ v2.0: Auto-migrate to v4.0  
- ✅ v1.0: Auto-migrate to v4.0

### Export Support

- ✅ v4.0: Default format
- ❌ v3.0: Not supported (use v4.0)

## Security Considerations

### Data Privacy

- All data stored locally
- No automatic cloud upload
- User controls export location

### Input Validation

- Validate image mimeTypes
- Check file sizes
- Sanitize filenames
- Verify base64 encoding

### XSS Prevention

- Escape captions
- Validate data URLs
- Use Content Security Policy

## Future Enhancements (Out of Scope)

1. **Compression Format**
   - ZIP backup files
   - Streaming compression

2. **Encryption**
   - Password-protected backups
   - End-to-end encryption

3. **Cloud Sync**
   - Auto-backup to Google Drive
   - Selective sync

4. **Multi-media**
   - Audio recordings
   - Video clips

5. **Incremental Backups**
   - Only backup changes
   - Smaller file sizes

---

**Design completed by**: Claude (AI Agent)  
**Date**: 2026-02-24  
**Status**: Ready for implementation  
**Next**: Begin Phase 1 - MediaStorageService
