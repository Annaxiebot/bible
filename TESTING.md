# Testing Chinese Reference Detection & Manual Search

## Date: 2026-02-15

## Changes Made

### 1. Fixed Chinese Book Name Detection
- **File**: `bible-app/components/ChatInterface.tsx`
- **Issue**: Chinese references like "诗篇95:11" were not being detected as clickable links in AI responses
- **Fix**: 
  - Added regex escaping for special characters in book names
  - Added optional whitespace handling (`\\s*`) between book name and chapter number
  - Improved pattern matching to handle Chinese characters properly

### 2. Implemented Manual Search from Context Menu
- **File**: `bible-app/components/ChatInterface.tsx`
- **Issue**: Context menu "搜索经文 Search Reference" button was not functional
- **Fix**:
  - Modified `handleContextMenuAction` to try parsing selected text as a complete Bible reference first
  - Falls back to current book context for standalone chapter:verse patterns
  - Now supports both full references (e.g., "诗篇95:11") and partial references (e.g., "95:11" when in Psalms)

## Testing Steps

### Test 1: Chinese Reference Detection in AI Responses
1. Open http://localhost:3001/bible/ (or port 3000)
2. Navigate to any chapter
3. In the chat interface, ask the AI: "请解释诗篇95:11"
4. **Expected**: The AI response should contain "诗篇95:11" as a clickable link
5. **Expected**: Clicking the link should navigate to Psalms 95:11 and highlight verse 11

### Test 2: Multiple Chinese References
1. Ask the AI: "比较创世记1:1和约翰福音3:16"
2. **Expected**: Both "创世记1:1" and "约翰福音3:16" should be clickable links
3. **Expected**: Clicking each link navigates to the correct verse

### Test 3: Manual Search - Full Reference
1. In any AI response, manually select text containing a reference (e.g., "诗篇95:11")
2. Right-click or tap to open context menu
3. Click "搜索经文 Search Reference"
4. **Expected**: Browser navigates to Psalms 95:11 with verse 11 highlighted

### Test 4: Manual Search - Partial Reference
1. Navigate to Psalms chapter 95
2. In an AI response, manually select text containing just "95:11" or "11"
3. Open context menu and click "搜索经文 Search Reference"
4. **Expected**: Should attempt to navigate to verse 11 in current book context

### Test 5: Reference with Ranges
1. Ask AI: "解释马太福音5:3-10"
2. **Expected**: "马太福音5:3-10" should be a clickable link
3. **Expected**: Clicking should navigate to Matthew 5 and highlight verses 3-10

## Automated Tests

Run the test script to verify parsing logic:

```bash
cd bible-app
node test-refs.js
```

**Expected output**: All 7 tests should pass

## Known Limitations

1. Only Chinese book names in the CHINESE_BOOK_MAP are supported (all 66 books included)
2. References must follow the pattern: `书名数字:数字` (e.g., "诗篇95:11")
3. English references require a space before the chapter number (e.g., "Psalm 95:11")
4. Standalone chapter:verse patterns (e.g., "2:3") only work when there's a current book context

## Cleanup

After testing, you can remove:
- `bible-app/test-refs.js`
- `bible-app/test-chinese-refs.html`
- `bible-app/TESTING.md` (this file)
