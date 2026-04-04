# Journal Print Function - TODO

## Requirements

Print journal entries with full fidelity:
- ✅ Text blocks (with rich formatting: colors, fonts, sizes, alignment, lists)
- ✅ Drawing blocks (handwritten notes, sketches)
- ✅ Image blocks (photos, annotations on photos)
- ✅ Mixed content (text + drawings + images in proper order)
- ✅ Preserve layout and styling
- ✅ Multiple entries (select which to print)

## Print Options

**Single Entry:**
- Print current journal entry
- Include all blocks in order
- Preserve formatting

**Multiple Entries:**
- Select multiple journal entries from list
- Print all selected entries (each on new page)
- Option: print date range (e.g., "last 7 days", "this month")

**Export Formats:**
- PDF (primary)
- Print to printer (browser print dialog)
- Optional: Export as HTML for archival

## UI/UX

**Print Button Location:**
- Add to JournalView toolbar (next to other actions)
- Icon: 🖨️ or printer icon
- Click → opens print preview/options dialog

**Print Dialog:**
- Preview of what will print
- Options:
  - Include drawings: Yes/No
  - Include images: Yes/No
  - Include metadata (date, location, tags): Yes/No
  - Page size: Letter/A4
  - Orientation: Portrait/Landscape
- Buttons: Print, Save as PDF, Cancel

## Technical Implementation

### 1. Print Service Extension
**File:** `services/printService.ts` (already exists for Bible chapters)

Extend for journal:
- `printJournalEntry(entryId: string, options: PrintOptions)` - Single entry
- `printJournalEntries(entryIds: string[], options: PrintOptions)` - Multiple
- `printJournalDateRange(startDate: string, endDate: string, options: PrintOptions)` - Date range

### 2. Block Rendering for Print
**Challenges:**
- Text blocks: Render HTML with inline styles (preserve colors, fonts, etc.)
- Drawing blocks: Convert canvas to image (canvas.toDataURL('image/png'))
- Image blocks: Include inline or reference

**Approach:**
- Create print-specific renderer that converts blocks to print-friendly HTML
- Inject CSS for print (@media print rules)
- Use CSS page breaks to avoid splitting blocks awkwardly

### 3. Canvas to Image
For drawing blocks:
```typescript
const canvas = canvasRef.current;
const imageDataUrl = canvas.toDataURL('image/png');
// Insert <img src={imageDataUrl} /> into print HTML
```

### 4. Print Preview
Use browser's native print preview:
```typescript
const printWindow = window.open('', '_blank');
printWindow.document.write(printHtml);
printWindow.document.close();
printWindow.print();
```

Or use library like `html2pdf.js` or `jsPDF` for PDF generation.

### 5. Page Layout
CSS for print:
```css
@media print {
  .journal-entry {
    page-break-after: always;
  }
  .journal-block {
    page-break-inside: avoid;
  }
  /* Hide UI elements */
  .no-print {
    display: none;
  }
}
```

## Files to Modify/Create

- `services/printService.ts` - Extend with journal print functions
- `components/JournalView.tsx` - Add print button + dialog
- `components/JournalPrintDialog.tsx` - New component for print options
- `utils/journalPrintRenderer.tsx` - Convert blocks to print HTML
- `styles/print.css` - Print-specific styles

## Testing (MANDATORY)

- [ ] Unit tests for block → HTML conversion
- [ ] Test text block rendering (all formatting preserved)
- [ ] Test drawing block rendering (canvas → image)
- [ ] Test image block rendering
- [ ] Test mixed content (text + drawing + image)
- [ ] Test multi-entry print
- [ ] Test date range print
- [ ] Test print preview opens correctly
- [ ] Test PDF export (if implemented)
- [ ] E2E test: create entry, print, verify output
- [ ] All existing tests must pass
- [ ] Coverage >70%

## Success Criteria

- [ ] Print button in JournalView
- [ ] Print dialog with options
- [ ] Single entry prints correctly
- [ ] Multiple entries print correctly
- [ ] All block types render properly
- [ ] Rich text formatting preserved
- [ ] Drawings appear as images
- [ ] Photos included
- [ ] Works in Chrome, Safari, Firefox
- [ ] Mobile: Share/Save as PDF option
- [ ] All tests passing

## Nice-to-Haves (Optional)

- [ ] Print templates (minimal, detailed, fancy)
- [ ] Header/footer with app logo + date
- [ ] Table of contents for multi-entry prints
- [ ] Export to Markdown
- [ ] Batch export all journals to PDF

## Notes

- Use existing printService.ts as reference (already handles Bible chapters)
- Consider using `html2canvas` for complex rendering
- Test on actual printers (not just PDF)
- Mobile: Use Web Share API for "Share as PDF"
