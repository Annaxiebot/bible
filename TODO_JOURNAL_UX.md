# Journal UX Improvements - TODO List

## Priority 1: Core UX Fixes (In Progress)

### 1. Fix Undo/Redo ⏳
- [ ] Make undo work properly in the journal canvas (currently broken)
- [ ] Test undo/redo for drawing strokes
- [ ] Test undo/redo for text edits
- [ ] Test undo/redo for block operations

### 2. Fix Z-Index Layering ⏳
- [ ] Handwriting is covering text - fix layer order
- [ ] Text should display above drawings
- [ ] Ensure proper layering for all block types (text, drawing, images)

### 3. Extendable Handwriting Areas ⏳
- [ ] Canvas sections should expand vertically as user draws
- [ ] Remove fixed height limitation
- [ ] Add smooth auto-expansion UX
- [ ] Test on mobile/tablet with Apple Pencil

### 4. Photo Resize & Annotation ⏳
- [ ] Allow users to resize embedded images
- [ ] Add pinch-zoom support for mobile/tablet
- [ ] Add corner drag handles for desktop
- [ ] Enable drawing/annotation directly on photos
- [ ] Test annotation persistence across sessions

### 5. Block-Based Editor ⏳
- [ ] Allow inserting new text blocks
- [ ] Allow inserting new handwriting/drawing blocks
- [ ] Allow inserting new image blocks
- [ ] Drag to reorder blocks
- [ ] Add delete block functionality
- [ ] Add duplicate block functionality
- [ ] Test block reordering with sync

### 6. Pagination ⏳
- [ ] Add pagination or infinite scroll for long journals
- [ ] Improve performance with many blocks
- [ ] Test with 100+ blocks
- [ ] Lazy load images and canvases

## Priority 2: Rich Text Formatting (Next)

### 7. Text Editor Enhancements 📝
**Font & Color Tools:**
- [ ] Font color picker
- [ ] Background/highlight color picker
- [ ] Font size dropdown (small, normal, large, extra large, custom)

**Formatting Options (expand existing B, I, U, H toolbar):**
- [x] Bold (B) - already exists
- [x] Italic (I) - already exists
- [x] Underline (U) - already exists
- [ ] Strikethrough
- [ ] Text alignment (left, center, right, justify)
- [ ] Bullet list
- [ ] Numbered list
- [ ] Indent/outdent
- [ ] Link insertion
- [ ] Clear formatting button

**UI/UX:**
- [ ] Expand existing toolbar (currently B, I, U, H, "", ≡)
- [ ] Mobile-friendly design (collapsible sections or dropdowns)
- [ ] Match purple/blue theme
- [ ] Similar UX to Google Docs / Notion mobile editors

**Data & Compatibility:**
- [ ] Store formatted text as HTML or rich text format in IndexedDB
- [ ] Ensure compatibility with existing journal entries
- [ ] Add migration for old plain text entries
- [ ] Test sync of formatted text across devices

**Testing:**
- [ ] Unit tests for all formatting features
- [ ] E2E tests for toolbar interactions
- [ ] Test formatted text persistence
- [ ] Test copy/paste from external sources

## Testing Requirements (MANDATORY - All Features)

- [ ] Write comprehensive tests for all new features
- [ ] All existing tests must pass (`npm run test`)
- [ ] Coverage >70% overall
- [ ] Coverage >90% for business logic
- [ ] Provide test results + coverage report before delivery
- [ ] NO DELIVERY without proof

## Technical Context

- **Files:** 
  - `components/JournalView.tsx` - Main journal view
  - `components/JournalEditor.tsx` - Editor component
  - `components/SimpleDrawingCanvas.tsx` - Drawing system
  - `services/journalStorage.ts` - IndexedDB storage
- **Tech Stack:** React + TypeScript + Vite
- **Storage:** IndexedDB (local) + Supabase Realtime (sync)
- **Branch:** `feature/journal-ux-improvements`

## Notes

- Chris expects professional engineering standards
- No regressions allowed
- Modular, reusable code
- Performance matters (lightweight bundles, fast load)
- Test coverage is non-negotiable
