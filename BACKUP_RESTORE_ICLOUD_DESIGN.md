# iCloud Drive Backup/Restore Design

**Version**: 1.1  
**Date**: 2026-02-24  
**Addendum to**: BACKUP_RESTORE_DESIGN.md  
**New Requirement**: User-chosen backup location with iCloud Drive support

---

## Overview

Enable users to choose where to save backup files, with special support for iCloud Drive to enable cross-device restoration on iOS devices sharing the same iCloud account.

## Requirements

### Core Requirements
1. ✅ User can choose backup file save location
2. ✅ Support iCloud Drive as save location
3. ✅ Default to iCloud Drive if available (iOS)
4. ✅ Support any user-chosen location
5. ✅ Enable restore from iCloud Drive on another device
6. ✅ Document iCloud Drive setup for users

### Platform-Specific Requirements
- **iOS**: Use native file picker, prioritize iCloud Drive
- **Web**: Use File System Access API (Chrome/Edge) or fallback to downloads
- **Android**: Use native file picker, support cloud storage

---

## Technical Approach

### Capacitor Integration

The app already has Capacitor configured with FilesystemPlugin:

```json
// ios/App/App/capacitor.config.json
{
  "appId": "com.annaxiebot.scriptureScholar",
  "appName": "Scripture Scholar",
  "plugins": {
    "FilesystemPlugin": { ... }
  }
}
```

We'll use:
1. **@capacitor/filesystem** - File system operations
2. **@capacitor/file-picker** (NEW) - Native file picker UI
3. **iCloud Container** - iOS iCloud Drive integration

### Architecture Updates

```typescript
services/backup/
  ├── BackupService.ts           # Enhanced with location selection
  ├── RestoreService.ts          # Enhanced with file picker
  ├── MediaStorageService.ts     
  ├── FileLocationService.ts     # NEW - Platform-specific file operations
  └── __tests__/
      └── FileLocationService.test.ts
```

---

## API Design

### FileLocationService

```typescript
/**
 * Platform-aware file location service.
 * Handles file picker, iCloud Drive, and cross-platform storage.
 */
class FileLocationService {
  
  /**
   * Detect if running on iOS/Android (Capacitor native)
   */
  isNativePlatform(): boolean;
  
  /**
   * Check if iCloud Drive is available (iOS only)
   */
  async isICloudAvailable(): Promise<boolean>;
  
  /**
   * Get default backup directory based on platform
   * - iOS: iCloud Drive container (if available)
   * - Android: Downloads or user-chosen cloud storage
   * - Web: Browser downloads folder
   */
  async getDefaultBackupDirectory(): Promise<string | null>;
  
  /**
   * Show native file picker to choose save location
   * @returns Selected directory path or null if cancelled
   */
  async pickSaveLocation(): Promise<{
    path: string;
    displayName: string;
    isICloud: boolean;
  } | null>;
  
  /**
   * Save backup file to chosen location
   * @param content - JSON backup content
   * @param filename - Suggested filename
   * @param directory - Optional directory path (from pickSaveLocation)
   */
  async saveBackupFile(
    content: string,
    filename: string,
    directory?: string
  ): Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;
  
  /**
   * Show file picker to select backup file for restore
   * @returns File content and metadata
   */
  async pickBackupFile(): Promise<{
    content: string;
    filename: string;
    path: string;
  } | null>;
  
  /**
   * List backup files in default directory (for quick access)
   */
  async listBackupFiles(directory?: string): Promise<Array<{
    filename: string;
    path: string;
    size: number;
    modifiedAt: number;
  }>>;
  
  /**
   * Get iCloud Drive container path (iOS only)
   */
  async getICloudContainerPath(): Promise<string | null>;
  
  /**
   * Check if a path is in iCloud Drive
   */
  isICloudPath(path: string): boolean;
}
```

### BackupService Enhancement

```typescript
interface BackupOptions {
  // Existing options...
  includeNotes?: boolean;
  includeMedia?: boolean;
  // ... etc
  
  // NEW: Location options
  saveLocation?: 'auto' | 'choose' | 'icloud' | 'downloads';
  customDirectory?: string;  // If saveLocation === 'choose'
  
  onProgress?: ProgressCallback;
}

class BackupService {
  // Existing methods...
  
  /**
   * Create backup and save to user-chosen location
   */
  async createAndSaveBackup(
    options?: BackupOptions
  ): Promise<{
    success: boolean;
    backup?: FullBackupExport_v4;
    savedPath?: string;
    error?: string;
  }>;
  
  /**
   * Get available save locations based on platform
   */
  async getAvailableLocations(): Promise<Array<{
    id: 'icloud' | 'downloads' | 'custom';
    name: string;
    description: string;
    available: boolean;
    recommended: boolean;
  }>>;
}
```

### RestoreService Enhancement

```typescript
class RestoreService {
  // Existing methods...
  
  /**
   * Show file picker and restore from selected backup
   */
  async restoreFromFilePicker(
    options?: RestoreOptions
  ): Promise<RestoreResult>;
  
  /**
   * List available backups in default location
   */
  async listAvailableBackups(): Promise<Array<{
    filename: string;
    path: string;
    summary: BackupSummaryData;
    isICloud: boolean;
  }>>;
  
  /**
   * Quick restore from most recent backup in iCloud Drive
   */
  async quickRestoreFromICloud(): Promise<RestoreResult>;
}
```

---

## Implementation Details

### iOS iCloud Drive Integration

#### Step 1: Enable iCloud Container

**Update capacitor.config.json:**
```json
{
  "ios": {
    "contentInset": "always",
    "scrollEnabled": true
  },
  "plugins": {
    "Filesystem": {
      "iosUseDocumentDirectory": false,
      "iosUseICloudContainers": true
    }
  }
}
```

#### Step 2: Configure Xcode Project

**Update App.entitlements:**
```xml
<key>com.apple.developer.icloud-container-identifiers</key>
<array>
  <string>iCloud.com.annaxiebot.scriptureScholar</string>
</array>
<key>com.apple.developer.ubiquity-container-identifiers</key>
<array>
  <string>iCloud.com.annaxiebot.scriptureScholar</string>
</array>
```

#### Step 3: File Operations

```typescript
// iOS-specific iCloud path
const ICLOUD_CONTAINER = 'iCloud.com.annaxiebot.scriptureScholar';
const BACKUP_FOLDER = 'Documents/Backups';

async saveToICloud(content: string, filename: string): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  
  const path = `${BACKUP_FOLDER}/${filename}`;
  
  await Filesystem.writeFile({
    path,
    data: content,
    directory: Directory.Documents,
    encoding: Encoding.UTF8
  });
  
  return path;
}

async readFromICloud(filename: string): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  
  const result = await Filesystem.readFile({
    path: `${BACKUP_FOLDER}/${filename}`,
    directory: Directory.Documents,
    encoding: Encoding.UTF8
  });
  
  return result.data as string;
}

async listICloudBackups(): Promise<Array<FileInfo>> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  
  const result = await Filesystem.readdir({
    path: BACKUP_FOLDER,
    directory: Directory.Documents
  });
  
  return result.files.filter(f => f.name.endsWith('.json'));
}
```

### Web Platform (File System Access API)

```typescript
async pickSaveLocationWeb(): Promise<FileSystemDirectoryHandle | null> {
  if (!('showDirectoryPicker' in window)) {
    console.warn('File System Access API not supported');
    return null;
  }
  
  try {
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads'
    });
    
    return dirHandle;
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}

async saveBackupWeb(
  content: string,
  filename: string,
  dirHandle?: FileSystemDirectoryHandle
): Promise<void> {
  if (dirHandle) {
    // Save to chosen directory
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  } else {
    // Fallback to download
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

async pickBackupFileWeb(): Promise<File | null> {
  if (!('showOpenFilePicker' in window)) {
    // Fallback to input element
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        resolve(file || null);
      };
      input.click();
    });
  }
  
  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'Bible App Backup',
          accept: { 'application/json': ['.json'] }
        }
      ]
    });
    
    return await fileHandle.getFile();
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}
```

### Android Platform

```typescript
async pickSaveLocationAndroid(): Promise<string | null> {
  const { Filesystem } = await import('@capacitor/filesystem');
  const { FilePicker } = await import('@capawesome/capacitor-file-picker');
  
  // On Android, use system file picker
  // User can choose any location including Google Drive, OneDrive, etc.
  
  try {
    const result = await FilePicker.pickDirectory();
    return result.path;
  } catch (err) {
    console.error('Failed to pick directory:', err);
    return null;
  }
}
```

---

## UI/UX Flow

### Backup Flow

```
┌─────────────────────────────────┐
│  User clicks "Create Backup"    │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Show save location options:    │
│  ○ iCloud Drive (recommended)   │ ← iOS only, if available
│  ○ Choose location              │
│  ○ Downloads                    │ ← Web fallback
└────────────┬────────────────────┘
             │
             ▼ (if "Choose location")
┌─────────────────────────────────┐
│  Show native file picker        │
│  (iOS: iCloud/Local)            │
│  (Web: File System Access API)  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Create backup with progress    │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Save to chosen location        │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Success message with path      │
│  "Backup saved to iCloud Drive" │
└─────────────────────────────────┘
```

### Restore Flow

```
┌─────────────────────────────────┐
│  User clicks "Restore Backup"   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Show quick options:            │
│  • Recent backups (if iCloud)   │
│  • Browse for file              │
└────────────┬────────────────────┘
             │
             ▼ (if "Browse")
┌─────────────────────────────────┐
│  Show file picker               │
│  (can access iCloud, local)     │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Parse and show summary         │
│  • 5 notes                      │
│  • 3 images                     │
│  • From: 2024-02-24             │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Select merge strategy          │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Restore with progress          │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Success! Data restored         │
└─────────────────────────────────┘
```

---

## Cross-Device Restore Testing

### Test Scenario

**Setup:**
1. Device A (iPhone 12): Create backup with images
2. Save to iCloud Drive
3. Device B (iPad Pro): Same iCloud account
4. Restore from iCloud Drive

**Expected Result:**
- ✅ Backup appears in iCloud Drive on Device B
- ✅ All notes restored
- ✅ All images restored
- ✅ Annotations preserved
- ✅ Reading history restored

### Test Cases

```typescript
describe('Cross-Device Restore (Manual Test)', () => {
  
  test('Backup created on iPhone appears in iCloud', async () => {
    // MANUAL TEST
    // 1. Create backup on iPhone
    // 2. Check Files app → iCloud Drive → Scripture Scholar
    // 3. Verify .json file exists
    // 4. Check file size matches expected
  });
  
  test('Backup from iCloud can be restored on iPad', async () => {
    // MANUAL TEST
    // 1. Open app on iPad
    // 2. Go to Restore
    // 3. Browse → iCloud Drive
    // 4. Select backup file
    // 5. Verify summary shows correct counts
    // 6. Restore
    // 7. Verify all data present
  });
  
  test('Images sync correctly across devices', async () => {
    // MANUAL TEST
    // 1. Add note with large image on iPhone
    // 2. Create backup to iCloud
    // 3. Restore on iPad
    // 4. Open note
    // 5. Verify image displays correctly
    // 6. Check image size/quality
  });
});
```

---

## User Documentation

### iCloud Drive Setup Guide

**For Users:**

#### Enabling iCloud Drive on iOS

1. Open **Settings** on your iPhone/iPad
2. Tap your **Apple ID** at the top
3. Tap **iCloud**
4. Enable **iCloud Drive**
5. Scroll down and enable **Scripture Scholar**

#### Creating Cross-Device Backup

1. In Scripture Scholar, open **Menu** → **Backup & Restore**
2. Tap **Create Backup**
3. Select **iCloud Drive** as save location
4. Wait for backup to complete
5. Backup is now available on all your devices!

#### Restoring on Another Device

1. On your other device, open Scripture Scholar
2. Open **Menu** → **Backup & Restore**
3. Tap **Restore from Backup**
4. Select **Browse iCloud Drive**
5. Choose your backup file
6. Review summary and tap **Restore**
7. Your notes, images, and data will be restored!

#### Troubleshooting

**Backup not appearing in iCloud?**
- Check iCloud Drive is enabled in Settings
- Verify you're signed in with the same Apple ID
- Wait a few minutes for sync
- Check available iCloud storage

**Restore fails with large backup?**
- Ensure stable Wi-Fi connection
- Check available device storage
- Try restoring in sections (notes only first)

**Images not restoring?**
- Verify backup was created with "Include Images" checked
- Check device storage capacity
- Large images may take longer to restore

---

## Security Considerations

### iCloud Drive Security

- ✅ Encrypted in transit (TLS)
- ✅ Encrypted at rest (Apple's encryption)
- ✅ Requires Apple ID authentication
- ❌ NOT end-to-end encrypted by default

**Recommendation**: Add optional encryption in future update

```typescript
interface BackupOptions {
  // ... existing options
  
  // Future: Encryption
  encrypt?: boolean;
  password?: string;
}
```

### File Permissions

**iOS:**
- App can only access its own iCloud container
- User must grant file picker permissions
- Cannot access other apps' data

**Web:**
- File System Access API requires user gesture
- Browser permission prompt
- Sandboxed access

---

## Performance Considerations

### iCloud Sync

- **Upload speed**: Depends on file size and network
- **Typical backup** (100 notes + 50 images): 5-10 MB
- **Upload time**: 10-30 seconds on Wi-Fi
- **Sync delay**: 5-60 seconds for iCloud to sync across devices

### Optimization Strategies

1. **Compress backup before upload**
   ```typescript
   // Option to compress as .zip
   async createCompressedBackup(): Promise<Blob> {
     const backup = await this.createBackup();
     const json = JSON.stringify(backup.data);
     // Use compression library (e.g., pako)
     const compressed = pako.gzip(json);
     return new Blob([compressed], { type: 'application/gzip' });
   }
   ```

2. **Progress indicator for upload**
   ```typescript
   onProgress?.('Uploading to iCloud...', 90);
   ```

3. **Background upload** (iOS)
   - Use URLSession background tasks
   - Continue upload even if app backgrounded

---

## Migration Plan

### Phase 1: Add Dependencies

```bash
npm install @capacitor/filesystem @capacitor/file-picker
```

**Update package.json:**
```json
{
  "dependencies": {
    "@capacitor/filesystem": "^6.0.0",
    "@capacitor/file-picker": "^6.0.0"
  }
}
```

### Phase 2: iOS Configuration

1. Update `capacitor.config.json`
2. Update `App.entitlements` in Xcode
3. Test iCloud container access

### Phase 3: Implement FileLocationService

1. Create `services/backup/FileLocationService.ts`
2. Implement platform detection
3. Implement iOS iCloud operations
4. Implement Web File System Access API
5. Write unit tests

### Phase 4: Enhance BackupService

1. Add location selection to `createAndSaveBackup()`
2. Integrate FileLocationService
3. Update UI to show location options

### Phase 5: Enhance RestoreService

1. Add file picker to `restoreFromFilePicker()`
2. Add "Recent backups" list
3. Enable quick restore from iCloud

### Phase 6: Testing

1. Unit tests for FileLocationService
2. Integration tests (mock file system)
3. Manual testing on real iOS devices
4. Cross-device restore testing

### Phase 7: Documentation

1. In-app help text
2. User guide for iCloud setup
3. Troubleshooting guide
4. API documentation

---

## Updated Test Plan

### Additional Unit Tests

**FileLocationService.test.ts:**
```typescript
describe('FileLocationService', () => {
  test('detects iOS platform', () => {
    // Mock Capacitor.getPlatform()
    expect(service.isNativePlatform()).toBe(true);
  });
  
  test('detects iCloud availability on iOS', async () => {
    const available = await service.isICloudAvailable();
    expect(available).toBe(true);
  });
  
  test('returns iCloud as default on iOS', async () => {
    const dir = await service.getDefaultBackupDirectory();
    expect(dir).toContain('iCloud');
  });
  
  test('saves file to iCloud Drive', async () => {
    const result = await service.saveBackupFile(
      '{"version":"4.0"}',
      'test-backup.json'
    );
    
    expect(result.success).toBe(true);
    expect(result.path).toContain('iCloud');
  });
  
  test('lists backup files in directory', async () => {
    const files = await service.listBackupFiles();
    expect(files).toBeInstanceOf(Array);
  });
});
```

### Additional E2E Tests

**e2e/backup-icloud.spec.ts:**
```typescript
test('User saves backup to iCloud Drive (iOS)', async ({ page }) => {
  // Requires iOS simulator or device
  test.skip(process.env.PLATFORM !== 'ios');
  
  await page.click('[data-testid="create-backup"]');
  await page.click('[data-testid="location-icloud"]');
  await page.click('[data-testid="confirm-save"]');
  
  await page.waitForSelector('[data-testid="success-message"]');
  expect(await page.textContent('[data-testid="success-message"]'))
    .toContain('iCloud Drive');
});
```

---

## Success Criteria (Updated)

### Original Criteria
- ✅ All unit tests passing (>90% coverage)
- ✅ All integration tests passing
- ✅ All E2E tests passing
- ✅ Build succeeds
- ✅ No regressions

### Additional Criteria
- ✅ File picker works on iOS
- ✅ iCloud Drive integration functional
- ✅ Can save to iCloud Drive
- ✅ Can restore from iCloud Drive
- ✅ Cross-device restore verified (manual test)
- ✅ Works on Web (fallback)
- ✅ User documentation complete
- ✅ iCloud setup guide published

---

## Estimated Timeline (Updated)

**Original**: 10-14 days  
**Updated**: 12-16 days

**Additional time for:**
- Phase 1: FileLocationService (2 days)
- iOS configuration (1 day)
- Cross-device testing (1 day)

**New breakdown:**
- Phase 1: MediaStorageService (2-3 days)
- **Phase 1.5: FileLocationService (2 days)** ← NEW
- Phase 2: BackupService (2-3 days)
- Phase 3: RestoreService (2-3 days)
- Phase 4: Integration Tests (1-2 days)
- Phase 5: E2E Tests (2 days)
- **Phase 5.5: iOS Testing (1 day)** ← NEW
- Phase 6: Documentation (1 day)

---

## Dependencies

### NPM Packages

```bash
npm install @capacitor/filesystem@^6.0.0
npm install @capacitor/file-picker@^6.0.0
```

### iOS Requirements

- Xcode 14+
- iOS 13+ (for iCloud Drive support)
- Valid Apple Developer account (for iCloud entitlements)
- Test devices or simulator with iCloud configured

### Web Requirements

- Chrome 86+ or Edge 86+ (for File System Access API)
- Fallback for Safari/Firefox

---

**Updated Design by**: Claude (AI Agent)  
**Date**: 2026-02-24 23:35 PST  
**Status**: Ready for implementation with iCloud Drive support
