# iCloud Drive Testing - Test Plan Addendum

**Version**: 1.1  
**Date**: 2026-02-24  
**Addendum to**: BACKUP_RESTORE_TEST_PLAN.md  
**New Requirement**: iOS file picker and iCloud Drive support

---

## Additional Unit Tests

### FileLocationService.test.ts

```typescript
describe('FileLocationService - Platform Detection', () => {
  
  test('should detect iOS platform', () => {
    // Mock Capacitor.getPlatform()
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    
    const service = new FileLocationService();
    expect(service.isNativePlatform()).toBe(true);
  });
  
  test('should detect web platform', () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
    
    const service = new FileLocationService();
    expect(service.isNativePlatform()).toBe(false);
  });
  
  test('should detect Android platform', () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    
    const service = new FileLocationService();
    expect(service.isNativePlatform()).toBe(true);
  });
});

describe('FileLocationService - iCloud Detection (iOS)', () => {
  
  test('should detect iCloud availability', async () => {
    // Mock Filesystem.stat on iCloud path
    vi.spyOn(Filesystem, 'stat').mockResolvedValue({
      type: 'directory',
      size: 0,
      ctime: Date.now(),
      mtime: Date.now(),
      uri: 'file://iCloud...'
    });
    
    const service = new FileLocationService();
    const available = await service.isICloudAvailable();
    
    expect(available).toBe(true);
  });
  
  test('should handle iCloud unavailable', async () => {
    vi.spyOn(Filesystem, 'stat').mockRejectedValue(new Error('Not found'));
    
    const service = new FileLocationService();
    const available = await service.isICloudAvailable();
    
    expect(available).toBe(false);
  });
  
  test('should get iCloud container path', async () => {
    const service = new FileLocationService();
    const path = await service.getICloudContainerPath();
    
    expect(path).toBeDefined();
    expect(path).toContain('iCloud');
  });
});

describe('FileLocationService - Default Directory', () => {
  
  test('should return iCloud as default on iOS', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    // Mock iCloud available
    
    const service = new FileLocationService();
    const dir = await service.getDefaultBackupDirectory();
    
    expect(dir).toContain('iCloud');
  });
  
  test('should return Documents as fallback on iOS', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    // Mock iCloud unavailable
    
    const service = new FileLocationService();
    const dir = await service.getDefaultBackupDirectory();
    
    expect(dir).toBeDefined();
    expect(dir).not.toContain('iCloud');
  });
  
  test('should return null on web platform', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
    
    const service = new FileLocationService();
    const dir = await service.getDefaultBackupDirectory();
    
    expect(dir).toBeNull();
  });
});

describe('FileLocationService - File Picker', () => {
  
  test('should show native file picker on iOS', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    const mockPicker = vi.fn().mockResolvedValue({
      path: '/iCloud/Backups',
      name: 'iCloud Drive'
    });
    
    const service = new FileLocationService();
    const result = await service.pickSaveLocation();
    
    expect(result).toBeDefined();
    expect(result?.isICloud).toBe(true);
  });
  
  test('should handle picker cancellation', async () => {
    const mockPicker = vi.fn().mockRejectedValue({ name: 'AbortError' });
    
    const service = new FileLocationService();
    const result = await service.pickSaveLocation();
    
    expect(result).toBeNull();
  });
  
  test('should use File System Access API on web', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
    
    // Mock showDirectoryPicker
    global.showDirectoryPicker = vi.fn().mockResolvedValue({
      kind: 'directory',
      name: 'Downloads'
    });
    
    const service = new FileLocationService();
    const result = await service.pickSaveLocation();
    
    expect(global.showDirectoryPicker).toHaveBeenCalled();
  });
});

describe('FileLocationService - Save Operations', () => {
  
  test('should save to iCloud Drive on iOS', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios');
    vi.spyOn(Filesystem, 'writeFile').mockResolvedValue({ uri: 'file://...' });
    
    const service = new FileLocationService();
    const result = await service.saveBackupFile(
      '{"version":"4.0"}',
      'test-backup.json'
    );
    
    expect(result.success).toBe(true);
    expect(result.path).toContain('iCloud');
  });
  
  test('should save to custom directory', async () => {
    const customDir = '/custom/path';
    vi.spyOn(Filesystem, 'writeFile').mockResolvedValue({ uri: 'file://...' });
    
    const service = new FileLocationService();
    const result = await service.saveBackupFile(
      '{"version":"4.0"}',
      'test-backup.json',
      customDir
    );
    
    expect(result.success).toBe(true);
    expect(Filesystem.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining(customDir)
      })
    );
  });
  
  test('should handle save errors', async () => {
    vi.spyOn(Filesystem, 'writeFile').mockRejectedValue(new Error('No space'));
    
    const service = new FileLocationService();
    const result = await service.saveBackupFile(
      '{"version":"4.0"}',
      'test-backup.json'
    );
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('No space');
  });
});

describe('FileLocationService - Read Operations', () => {
  
  test('should pick backup file', async () => {
    vi.spyOn(FilePicker, 'pickFiles').mockResolvedValue({
      files: [{
        path: '/iCloud/backup.json',
        name: 'backup.json',
        size: 12345,
        mimeType: 'application/json',
        data: '{"version":"4.0"}'
      }]
    });
    
    const service = new FileLocationService();
    const result = await service.pickBackupFile();
    
    expect(result).toBeDefined();
    expect(result?.content).toContain('"version":"4.0"');
  });
  
  test('should list backup files in directory', async () => {
    vi.spyOn(Filesystem, 'readdir').mockResolvedValue({
      files: [
        { name: 'backup-2024-01-01.json', type: 'file', size: 1000 },
        { name: 'backup-2024-01-02.json', type: 'file', size: 2000 }
      ]
    });
    
    const service = new FileLocationService();
    const files = await service.listBackupFiles();
    
    expect(files).toHaveLength(2);
    expect(files[0].filename).toBe('backup-2024-01-01.json');
  });
});

describe('FileLocationService - Path Validation', () => {
  
  test('should detect iCloud path', () => {
    const service = new FileLocationService();
    
    expect(service.isICloudPath('/iCloud/Backups/file.json')).toBe(true);
    expect(service.isICloudPath('/Documents/file.json')).toBe(false);
  });
});
```

**Coverage Target**: >90%  
**Total Tests**: ~20

---

## Additional E2E Tests

### tests/e2e/backup-icloud.spec.ts

```typescript
import { test, expect } from '@playwright/test';

test.describe('Backup to iCloud Drive (iOS)', () => {
  
  test.skip(({ browserName }) => browserName !== 'webkit', 'iOS only');
  
  test.beforeEach(async ({ page, context }) => {
    // Configure for iOS
    await context.grantPermissions(['filesystem']);
    await page.goto('/');
  });
  
  test('User saves backup to iCloud Drive', async ({ page }) => {
    // 1. Create some test data
    await page.click('[data-testid="book-genesis"]');
    await page.click('[data-testid="chapter-1"]');
    await page.fill('[data-testid="note-editor"]', 'Test note');
    await page.click('[data-testid="save-note"]');
    
    // 2. Open backup dialog
    await page.click('[data-testid="menu"]');
    await page.click('[data-testid="backup-restore"]');
    await page.click('[data-testid="create-backup"]');
    
    // 3. Select iCloud Drive
    await page.waitForSelector('[data-testid="location-options"]');
    await page.click('[data-testid="location-icloud"]');
    
    // 4. Confirm save
    await page.click('[data-testid="confirm-save"]');
    
    // 5. Wait for completion
    await page.waitForSelector('[data-testid="success-message"]', {
      timeout: 30000  // iCloud upload may take time
    });
    
    // 6. Verify success message
    const message = await page.textContent('[data-testid="success-message"]');
    expect(message).toContain('iCloud Drive');
    expect(message).toMatch(/backup.*saved/i);
  });
  
  test('User chooses custom location via file picker', async ({ page }) => {
    await page.click('[data-testid="create-backup"]');
    await page.click('[data-testid="location-choose"]');
    
    // File picker should open (manual interaction in real test)
    // This would require iOS simulator automation
    
    // For E2E, we can mock the picker result
    await page.evaluate(() => {
      window.__mockFilePickerResult = {
        path: '/Custom/Location',
        displayName: 'Custom Location',
        isICloud: false
      };
    });
    
    await page.click('[data-testid="confirm-save"]');
    
    const message = await page.textContent('[data-testid="success-message"]');
    expect(message).toContain('Custom Location');
  });
  
  test('Shows iCloud as recommended on iOS', async ({ page }) => {
    await page.click('[data-testid="create-backup"]');
    
    const icloudOption = page.locator('[data-testid="location-icloud"]');
    await expect(icloudOption).toBeVisible();
    
    const badge = icloudOption.locator('[data-testid="recommended-badge"]');
    await expect(badge).toBeVisible();
  });
  
  test('Handles iCloud unavailable gracefully', async ({ page }) => {
    // Mock iCloud unavailable
    await page.evaluate(() => {
      window.__mockICloudAvailable = false;
    });
    
    await page.click('[data-testid="create-backup"]');
    
    const icloudOption = page.locator('[data-testid="location-icloud"]');
    await expect(icloudOption).toBeDisabled();
    
    const tooltip = await icloudOption.getAttribute('title');
    expect(tooltip).toContain('iCloud Drive not available');
  });
});

test.describe('Restore from iCloud Drive (iOS)', () => {
  
  test.skip(({ browserName }) => browserName !== 'webkit', 'iOS only');
  
  test('User restores from iCloud Drive', async ({ page }) => {
    // 1. Navigate to restore
    await page.click('[data-testid="menu"]');
    await page.click('[data-testid="backup-restore"]');
    await page.click('[data-testid="restore-backup"]');
    
    // 2. Browse iCloud Drive
    await page.click('[data-testid="browse-icloud"]');
    
    // 3. File picker opens (would show iCloud files)
    // In real test, user selects file manually
    
    // Mock file selection
    await page.evaluate(() => {
      window.__mockSelectedFile = {
        path: '/iCloud/Backups/backup-2024-01-01.json',
        content: JSON.stringify({
          version: '4.0',
          notes: { data: {...} },
          media: { images: [] }
        })
      };
    });
    
    // 4. Verify summary displayed
    await page.waitForSelector('[data-testid="restore-summary"]');
    expect(await page.textContent('[data-testid="backup-source"]'))
      .toContain('iCloud Drive');
    
    // 5. Confirm restore
    await page.click('[data-testid="confirm-restore"]');
    
    // 6. Verify success
    await page.waitForSelector('[data-testid="restore-complete"]');
  });
  
  test('Shows recent backups from iCloud', async ({ page }) => {
    await page.click('[data-testid="restore-backup"]');
    
    // Mock recent backups list
    await page.evaluate(() => {
      window.__mockRecentBackups = [
        {
          filename: 'backup-2024-02-24.json',
          path: '/iCloud/Backups/backup-2024-02-24.json',
          size: 123456,
          modifiedAt: Date.now() - 3600000  // 1 hour ago
        }
      ];
    });
    
    await page.click('[data-testid="show-recent-backups"]');
    
    const recentList = page.locator('[data-testid="recent-backups-list"]');
    await expect(recentList).toBeVisible();
    
    const firstBackup = recentList.locator('[data-testid^="backup-item-"]').first();
    expect(await firstBackup.textContent()).toContain('1 hour ago');
    expect(await firstBackup.textContent()).toContain('iCloud');
  });
  
  test('Quick restore from most recent backup', async ({ page }) => {
    await page.click('[data-testid="restore-backup"]');
    await page.click('[data-testid="quick-restore-latest"]');
    
    // Should auto-select most recent iCloud backup
    await page.waitForSelector('[data-testid="restore-summary"]');
    
    await page.click('[data-testid="confirm-restore"]');
    await page.waitForSelector('[data-testid="restore-complete"]');
  });
});

test.describe('Cross-Device Sync (Manual)', () => {
  
  // These tests require actual iOS devices with shared iCloud account
  // They are documented here but must be run manually
  
  test.skip('Backup syncs from iPhone to iPad', async () => {
    /*
     * MANUAL TEST STEPS:
     * 
     * Device 1 (iPhone):
     * 1. Create backup with images
     * 2. Save to iCloud Drive
     * 3. Wait for upload (check progress)
     * 4. Verify in Files app
     * 
     * Device 2 (iPad):
     * 5. Open Files app → iCloud Drive
     * 6. Navigate to Scripture Scholar folder
     * 7. Verify backup file appears
     * 8. Check file size matches
     * 9. Open app and restore
     * 10. Verify all data restored
     */
  });
  
  test.skip('Images sync correctly across devices', async () => {
    /*
     * MANUAL TEST STEPS:
     * 
     * Device 1:
     * 1. Create note with 5MB image
     * 2. Backup to iCloud
     * 3. Wait for upload
     * 
     * Device 2:
     * 4. Restore from iCloud
     * 5. Open note
     * 6. Verify image displays
     * 7. Check image quality
     * 8. Verify thumbnail works
     */
  });
});
```

**Total E2E Tests**: ~10 additional tests

---

## Manual Testing Checklist (iOS)

### Setup Prerequisites

- [ ] iOS device with iOS 13+ (or simulator)
- [ ] Signed in to iCloud with sufficient storage
- [ ] iCloud Drive enabled in Settings
- [ ] Scripture Scholar app installed
- [ ] Test data prepared (notes with images)

### Test Scenarios

#### 1. iCloud Drive Availability

- [ ] Open Settings → [Name] → iCloud
- [ ] Verify iCloud Drive is enabled
- [ ] Open app → Settings → Storage
- [ ] Verify iCloud Drive shows as available
- [ ] Disable iCloud Drive
- [ ] Verify app shows iCloud unavailable message
- [ ] Re-enable iCloud Drive

#### 2. Create Backup to iCloud

- [ ] Create test notes with images (at least 3 notes, 5 images)
- [ ] Open Menu → Backup & Restore
- [ ] Click "Create Backup"
- [ ] Verify iCloud Drive is recommended
- [ ] Select "iCloud Drive"
- [ ] Click "Confirm"
- [ ] Observe progress indicator
- [ ] Wait for "Success" message
- [ ] Note the file path displayed

#### 3. Verify Backup in Files App

- [ ] Open Files app on iOS
- [ ] Navigate to iCloud Drive
- [ ] Find "Scripture Scholar" folder
- [ ] Verify backup file exists
- [ ] Check file size (should be reasonable)
- [ ] Long-press → Get Info
- [ ] Verify modification date is recent
- [ ] Verify file type is JSON

#### 4. Choose Custom Location

- [ ] Create backup again
- [ ] Select "Choose Location"
- [ ] Native file picker should open
- [ ] Navigate to different folder
- [ ] Select "On My iPhone" instead of iCloud
- [ ] Confirm save
- [ ] Verify success message shows custom path

#### 5. Restore from iCloud (Same Device)

- [ ] Clear all app data (or use clean install)
- [ ] Open Menu → Backup & Restore
- [ ] Click "Restore from Backup"
- [ ] Click "Browse iCloud Drive"
- [ ] File picker should show iCloud files
- [ ] Select backup file
- [ ] Verify summary shows correct counts
- [ ] Select merge strategy
- [ ] Click "Restore"
- [ ] Observe progress
- [ ] Wait for completion
- [ ] Verify all notes restored
- [ ] Verify all images display correctly

#### 6. Cross-Device Restore

**Device 1 (iPhone):**
- [ ] Create backup to iCloud Drive
- [ ] Wait for upload to complete
- [ ] Verify in Files app

**Device 2 (iPad with same iCloud account):**
- [ ] Wait 1-2 minutes for sync
- [ ] Open Files app → iCloud Drive
- [ ] Verify backup file appears
- [ ] Open Scripture Scholar app
- [ ] Restore from iCloud
- [ ] Verify all data restored correctly
- [ ] Check images display properly

#### 7. Large Backup Handling

- [ ] Create 50+ notes with 20+ images
- [ ] Create backup to iCloud
- [ ] Verify progress indicator updates
- [ ] Check upload time (note duration)
- [ ] Verify file size
- [ ] Test restore of large backup
- [ ] Verify no memory issues
- [ ] Check UI remains responsive

#### 8. Error Scenarios

**No Internet Connection:**
- [ ] Disable Wi-Fi and cellular
- [ ] Attempt backup to iCloud
- [ ] Verify error message
- [ ] Enable connection
- [ ] Retry backup

**iCloud Storage Full:**
- [ ] (Simulate if possible)
- [ ] Attempt backup
- [ ] Verify error message
- [ ] Suggest freeing space

**Corrupted Backup File:**
- [ ] Edit backup file in Files app (add garbage)
- [ ] Attempt restore
- [ ] Verify graceful error handling
- [ ] App should not crash

#### 9. Sync Timing

- [ ] Create backup on Device 1
- [ ] Immediately check Device 2 (should not see yet)
- [ ] Wait 30 seconds, refresh Files app
- [ ] Backup should appear
- [ ] Note sync delay for documentation

#### 10. Migration from v3.0

- [ ] Load v3.0 backup file to iCloud
- [ ] Restore on device
- [ ] Verify auto-migration to v4.0
- [ ] Create new backup
- [ ] Verify it's v4.0 format

---

## Performance Benchmarks (iOS)

### Upload Times (Wi-Fi)

| Backup Size | Upload Time | Notes |
|-------------|-------------|-------|
| 1 MB | < 5s | Small backup, few images |
| 5 MB | 10-15s | Typical backup |
| 10 MB | 20-30s | Many images |
| 25 MB | 45-60s | Very large backup |
| 50 MB | 90-120s | Maximum recommended |

### Download/Restore Times

| Backup Size | Restore Time | Notes |
|-------------|--------------|-------|
| 1 MB | < 10s | Quick restore |
| 5 MB | 15-20s | Typical |
| 10 MB | 30-40s | Processing images |
| 25 MB | 60-90s | Many images to decompress |
| 50 MB | 120-180s | Maximum size |

### Sync Delays

- **iCloud sync**: 5-60 seconds typical
- **Large files**: May take 2-5 minutes
- **Cellular**: 2-3x slower than Wi-Fi
- **Background sync**: Unreliable timing

---

## Test Data Fixtures

### Create Test Data Script

```typescript
// scripts/create-test-data.ts
async function createTestDataForBackup() {
  // Create 10 notes across different books
  for (let i = 0; i < 10; i++) {
    await verseDataStorage.savePersonalNote(
      `gen`, // Genesis
      i + 1, // Chapter
      [1],   // Verse
      {
        text: `Test note ${i + 1}`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    );
  }
  
  // Add images to some notes
  for (let i = 0; i < 5; i++) {
    const imageBlob = await generateTestImage(800, 600);
    await mediaStorage.saveImage(
      `gen:${i + 1}:1`,
      imageBlob
    );
  }
  
  // Add bookmarks
  await bookmarkStorage.addBookmark({
    id: 'gen:1',
    bookId: 'gen',
    bookName: 'Genesis',
    chapter: 1
  });
  
  console.log('Test data created successfully');
}
```

---

## Documentation Updates

### User Guide Section

**New Section: "Using iCloud Drive for Backups"**

#### Setting Up iCloud Drive

1. **Enable iCloud Drive on your iPhone/iPad:**
   - Open Settings
   - Tap your name at the top
   - Tap iCloud
   - Toggle on "iCloud Drive"
   - Ensure you have available storage

2. **Enable Scripture Scholar in iCloud:**
   - In iCloud settings
   - Scroll to Scripture Scholar
   - Toggle on

#### Creating a Backup to iCloud Drive

1. Open Scripture Scholar
2. Tap Menu (☰) → Backup & Restore
3. Tap "Create Backup"
4. Select "iCloud Drive" (recommended)
5. Tap "Confirm"
6. Wait for upload to complete

Your backup is now safe in iCloud and will sync to your other devices!

#### Restoring on Another Device

1. On your other device, open Scripture Scholar
2. Tap Menu → Backup & Restore
3. Tap "Restore from Backup"
4. Select "Browse iCloud Drive"
5. Choose your backup file
6. Review the summary
7. Tap "Restore"

All your notes and images will be restored!

#### Troubleshooting

**Problem**: Backup not appearing on other device  
**Solution**: 
- Wait a few minutes for iCloud to sync
- Check Wi-Fi connection
- Pull down to refresh in Files app

**Problem**: "iCloud Drive not available"  
**Solution**:
- Go to Settings → iCloud
- Enable iCloud Drive
- Sign in with your Apple ID

**Problem**: "Not enough iCloud storage"  
**Solution**:
- Go to Settings → iCloud → Manage Storage
- Delete old backups or files
- Or upgrade iCloud storage plan

---

## Success Criteria (Additional)

### iOS-Specific Requirements

- ✅ iCloud Drive integration functional on iOS 13+
- ✅ File picker works natively
- ✅ Backup saves to iCloud Drive
- ✅ Backup syncs across devices (verified manually)
- ✅ Restore works from iCloud Drive
- ✅ Images restore correctly across devices
- ✅ Graceful fallback when iCloud unavailable
- ✅ User documentation for iCloud setup complete
- ✅ Troubleshooting guide published

### Testing Requirements

- ✅ All unit tests passing (>90% coverage)
- ✅ FileLocationService tests passing
- ✅ iOS E2E tests passing
- ✅ Manual cross-device testing completed
- ✅ Performance benchmarks met
- ✅ Build succeeds for iOS

---

## Notes for Developers

### Testing on iOS Simulator

```bash
# Install iOS dependencies
npx cap sync ios

# Open in Xcode
npx cap open ios

# Configure iCloud entitlements in Xcode:
# 1. Select project → Signing & Capabilities
# 2. Add "iCloud" capability
# 3. Enable "iCloud Documents"
# 4. Configure container

# Run in simulator
# Note: iCloud may not work fully in simulator
# Use real device for iCloud testing
```

### Mocking iCloud in Tests

```typescript
// Mock Capacitor Filesystem
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn().mockResolvedValue({ uri: 'file://mock' }),
    readFile: vi.fn().mockResolvedValue({ data: '{"version":"4.0"}' }),
    readdir: vi.fn().mockResolvedValue({ files: [] }),
    stat: vi.fn().mockResolvedValue({ type: 'directory' })
  },
  Directory: {
    Documents: 'DOCUMENTS'
  },
  Encoding: {
    UTF8: 'utf8'
  }
}));
```

---

**Test Plan Addendum created by**: Claude (AI Agent)  
**Date**: 2026-02-24 23:40 PST  
**Status**: Ready for iOS implementation and testing
