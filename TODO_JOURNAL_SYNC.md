# Journal Real-Time Sync - TODO

## Database Schema ✅

**File created:** `database/journal-schema-update.sql`

**Manual step required:**
1. Go to Supabase dashboard → SQL Editor
2. Run `database/journal-schema-update.sql`
3. Verify tables created:
   - `journal` (with `blocks` JSONB field)
   - `journal_media` (optional, for large images)
4. Verify Realtime enabled:
   - `ALTER PUBLICATION supabase_realtime ADD TABLE journal;`

## Implementation Tasks

### 1. Update Sync Service ✅ (Partially)
- [x] `journal` already in `ALL_MODULES` list
- [ ] Add `blocks` field to journal sync payload
- [ ] Ensure drawing data syncs (already has `drawing` field)
- [ ] Test cross-device sync of blocks

### 2. Add Realtime Listeners
- [ ] Subscribe to journal table changes in `syncService.ts`
- [ ] Update local IndexedDB when remote journal changes
- [ ] Handle conflict resolution (last-write-wins or manual merge)
- [ ] Dispatch `journal-updated` event to refresh UI

### 3. Image Block Sync Strategy
Choose one:
- **Option A (Simple):** Store image data URLs in blocks (base64 in JSONB)
  - Pros: Simple, no extra uploads
  - Cons: Large payload, slower sync
- **Option B (Recommended):** Upload images to Supabase Storage
  - Pros: Fast sync, efficient storage
  - Cons: Requires storage bucket setup + upload logic
  - Use `journal_media` table to track references

### 4. Drawing Block Sync
- [ ] Verify drawing canvas data serializes correctly to JSONB
- [ ] Test extendable canvas height persists across devices
- [ ] Ensure annotation overlays on images sync

### 5. Text Block Sync
- [ ] Verify rich text HTML content syncs
- [ ] Test formatting (colors, fonts, alignment, lists) across devices
- [ ] Ensure no data loss on sync

### 6. Testing (MANDATORY)
- [ ] Unit tests for block serialization/deserialization
- [ ] E2E tests for cross-device sync
- [ ] Test offline → online sync (queue changes)
- [ ] Test conflict resolution
- [ ] Test sync with 100+ blocks (performance)
- [ ] Coverage >70%

## Files to Modify

- `services/syncService.ts` - Add blocks to journal sync, add Realtime listeners
- `services/journalStorage.ts` - Ensure blocks persist to IndexedDB
- `services/idbService.ts` - Verify JournalEntry type includes blocks
- `components/JournalView.tsx` - Handle realtime updates (refresh on remote change)
- `components/JournalBlockEditor.tsx` - Optimize for sync (debounce saves)

## Success Criteria

- [ ] Create journal entry on Device A → appears instantly on Device B
- [ ] Edit text block on Device A → updates on Device B within 1-2 seconds
- [ ] Draw on canvas on Device A → drawing appears on Device B
- [ ] Add image on Device A → image appears on Device B
- [ ] Rich text formatting syncs correctly
- [ ] Works offline (queues changes, syncs when online)
- [ ] No data loss or corruption
- [ ] All tests passing

## Notes

- **Debounce saves:** Auto-save every 2 seconds (already implemented)
- **Realtime latency:** Expect 100-500ms for cross-device updates
- **Large images:** Consider compression before upload
- **Conflict resolution:** Last-write-wins for now (can improve later with CRDT)
