# Backup/Restore Feature Research

**Date**: 2026-02-24  
**Branch**: `feature/backup-restore-with-images`  
**Status**: Research Phase

## Executive Summary

The Bible app has an **EXISTING** manual backup/restore feature that has **NEVER been fully tested**. The feature currently backs up notes, annotations, bookmarks, history, and reading plans, but does NOT include media attachments (images) despite the data structure already supporting them.

## Current Implementation

### Location
- **Service**: `services/exportImportService.ts`
- **Data Types**: `types/verseData.ts`

### What's Currently Backed Up (v3.0 format)

1. **Notes** (`BibleNotesExport`)
   - Personal notes (text)
   - AI research entries
   - Drawing data (JSON paths, not images)
   - ❌ Media attachments (defined but NOT implemented)

2. **Bible Texts** (`BibleTextExport`)
   - Offline chapter data
   - Multiple translations (CUV, WEB)

3. **Annotations** (`AnnotationRecord[]`)
   - Canvas drawing data (serialized paths)
   - Canvas dimensions and settings
   - NOT actual images - just vector paths

4. **Bookmarks** (`Bookmark[]`)
   - Chapter bookmarks

5. **Reading History**
   - History entries
   - Last read position
   - Reading progress

6. **Reading Plans** (`ReadingPlanState[]`)
   - Active and completed plans

### Backup File Format

**Current Version**: 3.0 (supports backward compatibility with 2.0 and 1.0)

```typescript
interface FullBackupExport {
  version: '3.0';
  exportDate: string;
  deviceId?: string;
  notes: BibleNotesExport;
  bibleTexts: BibleTextExport;
  annotations: AnnotationRecord[];
  bookmarks: Bookmark[];
  readingHistory: {...};
  readingPlans: ReadingPlanState[];
  metadata: {...};
}
```

## Critical Finding: Media Attachments

### Data Structure ALREADY EXISTS

```typescript
// types/verseData.ts
export interface MediaAttachment {
  id: string;
  type: 'image' | 'audio' | 'video';
  data: string; // base64 encoded
  thumbnail?: string;
  caption?: string;
  timestamp: number;
}

export interface PersonalNote {
  text: string;
  drawing?: string;
  media?: MediaAttachment[];  // ← DEFINED BUT NOT USED
  createdAt: number;
  updatedAt: number;
}
```

### Current Status

- ✅ **Data structure defined** - `MediaAttachment` interface exists
- ❌ **NOT implemented in UI** - No image upload/display functionality
- ❌ **NOT used in storage** - `media` field is never populated
- ❌ **NOT included in backup** - Export/import ignores media
- ❌ **NO tests** - Feature has NEVER been tested

## Gaps and Issues

### 1. Media Implementation Gap
- The `PersonalNote.media` field is defined but completely unused
- No UI components for adding/viewing images
- No validation or size limits
- No compression or optimization

### 2. Backup File Size Concerns
- Base64 encoding increases size by ~33%
- No chunking or streaming for large backups
- Single JSON file could become massive with images
- Browser memory limits could be exceeded

### 3. Storage Concerns
- IndexedDB has size limits (varies by browser)
- No cleanup of orphaned images
- No duplicate detection
- No image format optimization

### 4. Testing Gap
- **ZERO tests** for backup/restore functionality
- No E2E tests for full workflow
- No edge case testing
- No performance testing

### 5. Error Handling Gaps
- No validation of backup file structure
- No recovery from partial failures
- No rollback mechanism
- Limited progress feedback

## Architecture Review

### Current Services

1. **exportImportService.ts** (27KB)
   - Handles all backup/restore logic
   - Supports multiple formats (JSON, Markdown, HTML)
   - Has progress callbacks
   - Supports merge strategies

2. **verseDataStorage.ts** (14KB)
   - IndexedDB wrapper for verse notes
   - Stores PersonalNote objects
   - Does NOT populate `media` field

3. **annotationStorage.ts** (7KB)
   - Stores canvas drawing data
   - Separate from media images

### Design Issues

1. **Monolithic Service**
   - exportImportService does too much
   - Hard to test individual components
   - Not modular or reusable

2. **No Separation of Concerns**
   - Backup logic mixed with download logic
   - No separate validation layer
   - No separate compression/optimization

3. **Limited Extensibility**
   - Hard to add new data types
   - Format version handling is brittle
   - No plugin architecture

## Existing Test Infrastructure

### Testing Tools
- ✅ Vitest - unit/integration tests
- ✅ Playwright - E2E tests
- ✅ Coverage reporting configured

### Existing Tests (in services/__tests__/)
- ✅ bibleBookData.test.ts
- ✅ bibleStorage.test.ts
- ✅ bookmarkStorage.test.ts
- ✅ chineseConverter.test.ts
- ✅ notesStorage.test.ts
- ✅ verseDataStorage.test.ts
- ❌ **NO exportImportService tests!**
- ❌ **NO backup/restore E2E tests!**

### Test Commands
```bash
npm run test              # Run all unit tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
npm run test:e2e          # Playwright E2E tests
npm run test:all          # Both unit and E2E
```

## Image Storage Research

### Browser Storage Options

1. **IndexedDB** (RECOMMENDED)
   - ✅ Large storage capacity (50MB+ typical)
   - ✅ Async API
   - ✅ Structured data support
   - ✅ Already used for other data
   - ❌ Complex API

2. **localStorage**
   - ❌ 5-10MB limit
   - ❌ Synchronous (blocks UI)
   - ❌ String-only storage

3. **File System Access API**
   - ✅ No size limits
   - ❌ Limited browser support
   - ❌ Requires user permissions

### Image Format Considerations

1. **Base64** (Current approach)
   - ✅ Easy to serialize in JSON
   - ✅ No separate file management
   - ❌ ~33% size increase
   - ❌ Inefficient for large images

2. **Blob Storage**
   - ✅ More efficient storage
   - ✅ Can serve directly to img tags
   - ❌ Harder to serialize
   - ❌ Requires separate storage

3. **Compression**
   - Canvas API can compress to JPEG/WebP
   - Reduce quality for thumbnails
   - Client-side compression before storage

## Recommendations

### Phase 1: Research & Design ✅
- [x] Document current implementation
- [x] Identify gaps and issues
- [x] Review architecture
- [ ] Design enhancement plan
- [ ] Create test strategy

### Phase 2: Modular Refactor
- [ ] Extract BackupService
- [ ] Extract RestoreService  
- [ ] Extract MediaStorageService
- [ ] Add comprehensive interfaces
- [ ] Improve error handling

### Phase 3: Media Implementation
- [ ] Implement image upload UI
- [ ] Implement IndexedDB media storage
- [ ] Add image optimization/compression
- [ ] Add thumbnail generation
- [ ] Handle size limits

### Phase 4: Backup Enhancement
- [ ] Update backup format to v4.0
- [ ] Include media in backup export
- [ ] Add progress indicators
- [ ] Add validation layer
- [ ] Handle large file streaming

### Phase 5: Testing (MANDATORY)
- [ ] Unit tests for BackupService (>90% coverage)
- [ ] Unit tests for RestoreService (>90% coverage)
- [ ] Unit tests for MediaStorageService (>90% coverage)
- [ ] Integration tests for full backup/restore
- [ ] E2E tests for user workflow
- [ ] Edge case testing
- [ ] Performance testing

### Phase 6: Documentation
- [ ] API documentation
- [ ] User guide
- [ ] Migration guide (v3.0 → v4.0)
- [ ] Troubleshooting guide

## Next Steps

1. **Create Design Document**
   - Detailed architecture design
   - API specifications
   - Database schema
   - File format v4.0 spec

2. **Create Test Plan**
   - Test scenarios
   - Coverage targets
   - E2E workflows
   - Performance benchmarks

3. **Implementation Plan**
   - Break into small PRs
   - Test-driven development
   - Incremental rollout

## Open Questions

1. **Size Limits**
   - What's the max backup file size we should support?
   - Should we warn users before exporting large backups?
   - Should we compress the backup file itself (zip)?

2. **Image Formats**
   - Should we restrict to certain formats (JPEG, PNG, WebP)?
   - Should we auto-convert HEIC/other formats?
   - Should we enforce max dimensions?

3. **Storage Quotas**
   - How do we handle storage quota exceeded errors?
   - Should we request persistent storage?
   - Should we implement cleanup/archival?

4. **Backward Compatibility**
   - How long do we support v3.0 imports?
   - Do we auto-migrate on import?
   - What if migration fails?

5. **Sync Considerations**
   - How does this interact with Google Drive sync?
   - Should images sync separately?
   - How do we handle conflicts?

---

**Research completed by**: Claude (AI Agent)  
**Date**: 2026-02-24  
**Status**: Ready for design phase
