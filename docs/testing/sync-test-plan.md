# Supabase Sync - Test Plan

This document outlines the testing procedure for the cloud sync feature.

## Pre-Test Setup

### 1. Database Setup
- [ ] Log in to Supabase dashboard: https://supabase.com/dashboard/project/jyntvxgapvnmsfzgpnka
- [ ] Go to SQL Editor
- [ ] Copy content from `supabase-schema.sql`
- [ ] Run the SQL to create tables
- [ ] Verify tables created: `notes`, `annotations`, `reading_history`, `last_read`, `user_settings`

### 2. Auth Configuration (Optional for Testing)
- [ ] Go to Authentication → Providers → Email
- [ ] Disable "Enable email confirmations" for faster testing
- [ ] Save changes

### 3. Start Dev Server
```bash
cd bible-app
npm run dev
# Navigate to http://localhost:3000/bible/ (or port shown)
```

## Test Cases

### Test 1: Local Storage (No Account)
**Purpose**: Verify app works without authentication

1. [ ] Open app in incognito/private window
2. [ ] Navigate to a chapter (e.g., John 3)
3. [ ] Add a note to a verse
4. [ ] Draw on canvas (annotation)
5. [ ] Close and reopen browser
6. [ ] Verify notes and annotations persist
7. [ ] Open Sidebar → Cloud Sync
8. [ ] Verify message: "Your data is saved locally by default"

**Expected**: All data persists in browser, no account needed

### Test 2: Sign Up & Initial Sync
**Purpose**: Test account creation and first sync

1. [ ] Click "Sign In / Sign Up"
2. [ ] Switch to "Sign Up" tab
3. [ ] Enter email and password (min 6 chars)
4. [ ] Submit form
5. [ ] If email confirmation enabled: check email and verify
6. [ ] Verify sync status shows "✅ Synced"
7. [ ] Check browser console for "User authenticated - starting initial sync"
8. [ ] Go to Supabase → Table Editor → `notes`
9. [ ] Verify your notes appear in database

**Expected**: Account created, local data synced to cloud

### Test 3: Cross-Device Sync
**Purpose**: Verify data syncs across devices

**Device A:**
1. [ ] Sign in to account from Test 2
2. [ ] Add new note: "Cross-device test note"
3. [ ] Add new annotation (canvas drawing)
4. [ ] Click "Sync Now"
5. [ ] Wait for "✅ Synced" status

**Device B (or different browser):**
1. [ ] Open app in different browser/device
2. [ ] Sign in with same account
3. [ ] Wait for initial sync to complete
4. [ ] Navigate to chapter with note
5. [ ] Verify "Cross-device test note" appears
6. [ ] Verify canvas annotation appears

**Expected**: All data appears on both devices

### Test 4: Bidirectional Sync
**Purpose**: Test data syncing both ways

**Device A:**
1. [ ] Add note "From Device A"
2. [ ] Wait for auto-sync (5 minutes) or click "Sync Now"

**Device B:**
1. [ ] Add note "From Device B" (different verse)
2. [ ] Click "Sync Now"

**Device A:**
1. [ ] Click "Sync Now"
2. [ ] Verify "From Device B" note appears

**Device B:**
1. [ ] Click "Sync Now"
2. [ ] Verify "From Device A" note appears

**Expected**: Both notes appear on both devices

### Test 5: Offline Mode
**Purpose**: Verify app works offline and syncs when online

1. [ ] Sign in to account
2. [ ] Add note "Before offline"
3. [ ] Click "Sync Now"
4. [ ] Disconnect from internet (airplane mode or disconnect wifi)
5. [ ] Verify sync status shows "📡 Offline"
6. [ ] Add note "During offline"
7. [ ] Verify note saves locally
8. [ ] Reconnect to internet
9. [ ] Wait for sync status to change from "Offline" to "Syncing" to "Synced"
10. [ ] Verify "During offline" note synced to cloud

**Expected**: App works offline, auto-syncs when online

### Test 6: Reading History Sync
**Purpose**: Test reading history synchronization

**Device A:**
1. [ ] Sign in
2. [ ] Navigate through several chapters:
   - Genesis 1
   - John 3
   - Romans 8
3. [ ] Click "Sync Now"

**Device B:**
1. [ ] Sign in with same account
2. [ ] Wait for sync
3. [ ] Open Sidebar → Recent Reading (if available)
4. [ ] Verify reading history shows Genesis 1, John 3, Romans 8

**Expected**: Reading history syncs across devices

### Test 7: Annotation Sync (Canvas)
**Purpose**: Test handwritten notes sync

**Device A:**
1. [ ] Sign in
2. [ ] Navigate to Matthew 5
3. [ ] Draw on canvas (underline, circle text, etc.)
4. [ ] Expand canvas height
5. [ ] Click "Sync Now"

**Device B:**
1. [ ] Sign in
2. [ ] Navigate to Matthew 5
3. [ ] Verify canvas drawing appears
4. [ ] Verify canvas height matches

**Expected**: Canvas annotations and height sync perfectly

### Test 8: Sign Out
**Purpose**: Test sign out behavior

1. [ ] Sign in to account
2. [ ] Verify "Signed in as: your@email.com"
3. [ ] Click "Sign Out"
4. [ ] Verify auth panel returns to "Sign In / Sign Up" state
5. [ ] Verify local data still accessible (notes/annotations)
6. [ ] Verify sync status shows "Sync disabled" or "Not authenticated"

**Expected**: User signed out, local data remains accessible

### Test 9: Auto-Sync (Periodic)
**Purpose**: Verify automatic sync every 5 minutes

1. [ ] Sign in
2. [ ] Note the "Last sync" time
3. [ ] Add a note
4. [ ] Wait 5-6 minutes without clicking "Sync Now"
5. [ ] Verify sync status changes to "Syncing" then "Synced"
6. [ ] Verify "Last sync" time updated
7. [ ] Check browser console for "Running periodic sync"

**Expected**: Sync runs automatically every 5 minutes

### Test 10: Error Handling
**Purpose**: Test error scenarios

**Invalid Credentials:**
1. [ ] Try to sign in with wrong password
2. [ ] Verify error message displays
3. [ ] Verify no crash

**Network Error During Sync:**
1. [ ] Sign in
2. [ ] Disconnect internet
3. [ ] Click "Sync Now"
4. [ ] Verify error status (❌ or 📡 Offline)
5. [ ] Reconnect and verify recovery

**Expected**: Graceful error handling, no crashes

## Performance Tests

### Test 11: Large Dataset Sync
**Purpose**: Verify sync works with many notes

1. [ ] Create 50+ notes across different chapters
2. [ ] Sign in (triggers initial sync)
3. [ ] Monitor browser console for sync progress
4. [ ] Verify all notes uploaded successfully
5. [ ] Check Supabase database for all notes
6. [ ] Sign in on another device
7. [ ] Verify all notes downloaded successfully

**Expected**: Handles large datasets without issues

### Test 12: Sync Speed
**Purpose**: Measure sync performance

1. [ ] Time initial sync with ~20 notes
2. [ ] Time manual sync after adding 1 note
3. [ ] Time auto-sync (should be quick for few changes)

**Expected**: 
- Initial sync: < 5 seconds for 20 notes
- Incremental sync: < 2 seconds

## Database Verification

After tests, verify in Supabase dashboard:

1. [ ] **notes table**: Check for test notes, correct user_id
2. [ ] **annotations table**: Verify canvas data saved
3. [ ] **reading_history table**: Check reading history entries
4. [ ] **last_read table**: Verify last position saved
5. [ ] **RLS policies**: Try viewing data as different user (should fail)

## Browser Console Checks

Look for these messages:
- ✅ "User authenticated - starting initial sync"
- ✅ "Syncing notes..."
- ✅ "Syncing annotations..."
- ✅ "Syncing reading history..."
- ✅ "Full sync completed successfully"
- ✅ "Running periodic sync" (every 5 min)

## Known Issues / Limitations

- **Email Verification**: May need to disable for testing
- **Last-write-wins**: No conflict resolution UI yet
- **Large annotations**: Canvas data can be large; monitor performance
- **Bible cache**: Not synced (too large, cached per device)

## Rollback Plan

If issues found:
```bash
# Revert the commit
git revert HEAD

# Or checkout previous version
git checkout <previous-commit-hash>

# Rebuild
npm run build
```

## Sign-Off

- [ ] All test cases passed
- [ ] No console errors
- [ ] Performance acceptable
- [ ] Ready for production

**Tester**: _______________  
**Date**: _______________  
**Notes**: _______________
