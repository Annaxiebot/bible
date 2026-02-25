# Manual Testing Checklist - Auto-Save AI Research Feature

**Branch**: `feature/auto-save-ai-research`  
**Tester**: Chris  
**Date**: 2026-02-25 (morning)

---

## Pre-Testing Setup

- [ ] Pull latest code: `git fetch && git checkout feature/auto-save-ai-research`
- [ ] Install dependencies: `npm install` (if needed)
- [ ] Build the app: `npm run build`
- [ ] Start the app: `npm run dev`
- [ ] Open browser to `http://localhost:5173`

---

## Test 1: Basic Auto-Save (With Verse Context)

**Steps:**
1. Navigate to any Bible verse (e.g., Genesis 1:1)
2. Open AI Chat interface
3. Verify Settings show "Auto-save AI research notes" is **ON** (enabled)
4. Ask a question about the verse (e.g., "What does this verse mean?")
5. Wait for AI response

**Expected Results:**
- [ ] AI responds with bilingual answer (Chinese + English)
- [ ] Toast notification appears: "✅ AI research saved (2 notes)"
- [ ] Toast auto-dismisses after ~2 seconds
- [ ] No console errors
- [ ] Message has a green checkmark or "saved" indicator

**Verify Saved Data:**
1. Navigate to the verse's notes section
2. Look for auto-saved research entries

**Expected:**
- [ ] Two entries exist (Chinese + English)
- [ ] Each has tags: `auto-saved`, `chinese`/`english`, AI provider name
- [ ] Query and response are correct
- [ ] Timestamp is recent

---

## Test 2: Auto-Save Without Verse Context (General Research)

**Steps:**
1. Open AI Chat **without** selecting a specific verse
2. Ask a general Bible question (e.g., "What is the Gospel?")
3. Wait for response

**Expected Results:**
- [ ] Toast appears: "✅ AI research saved (2 notes)"
- [ ] No console errors

**Verify Saved Data:**
1. Check storage for "GENERAL" book, chapter 0
   - Browser DevTools → Application → IndexedDB → BibleVerseData → verseData
   - Look for entry with ID like `GENERAL:0:0`

**Expected:**
- [ ] Entry exists in GENERAL category
- [ ] Tags include `auto-saved`, `general-research`
- [ ] Both Chinese and English versions saved

---

## Test 3: Toggle Auto-Save On/Off

**Steps:**
1. Click Settings in AI Chat header
2. Find "Auto-save AI research notes" toggle
3. Turn toggle **OFF**
4. Click "Save & Apply"
5. Ask AI a question
6. Observe result

**Expected Results:**
- [ ] NO toast notification appears
- [ ] Research is NOT auto-saved
- [ ] Chat works normally

**Continue:**
7. Open Settings again
8. Turn toggle **ON**
9. Save & Apply
10. Ask another question

**Expected:**
- [ ] Toast appears again
- [ ] Auto-save resumes working

---

## Test 4: Duplicate Prevention

**Steps:**
1. Ensure auto-save is ON
2. Ask AI a specific question (e.g., "Explain John 3:16")
3. Wait for response and save
4. Immediately ask the **exact same question** again
5. Wait for response

**Expected Results:**
- [ ] First question: Toast shows "✅ AI research saved"
- [ ] Second question: NO toast appears (duplicate detected silently)
- [ ] Only ONE set of research entries saved (not duplicated)

---

## Test 5: Error Handling

**Test 5A: Empty Response**
1. Simulate empty response (if possible via mocking)
2. Verify no crash, graceful handling

**Expected:**
- [ ] No save attempt made
- [ ] No error toast shown
- [ ] Chat continues working

**Test 5B: Network Error (Simulate)**
1. Disconnect network
2. Ask question (if offline mode works)
3. Reconnect

**Expected:**
- [ ] IndexedDB still works offline
- [ ] Auto-save succeeds locally
- [ ] No crash

---

## Test 6: Large Response Truncation

**Steps:**
1. Ask a question that generates a very long response
   - Try: "Give me a detailed analysis of the entire book of Genesis"
2. Wait for response

**Expected Results:**
- [ ] Response is saved
- [ ] If over 50KB, content is truncated with message
- [ ] Toast appears
- [ ] No performance issues

---

## Test 7: Bilingual Response Handling

**Steps:**
1. Ask a question, get bilingual response
2. Check saved data

**Expected:**
- [ ] Chinese version saved with tag `chinese`
- [ ] English version saved with tag `english`
- [ ] Both entries reference same verse/chapter
- [ ] Both have same timestamp
- [ ] Both have same query

---

## Test 8: AI Provider Tagging

**Test with Gemini:**
1. Set AI provider to Gemini in settings
2. Ask a question
3. Check saved data

**Expected:**
- [ ] Tags include `gemini`

**Test with Claude:**
1. Switch to Claude provider
2. Ask a question
3. Check saved data

**Expected:**
- [ ] Tags include `claude`

---

## Test 9: Performance & Stability

**Steps:**
1. Ask 10 questions in a row (rapid fire)
2. Observe chat responsiveness
3. Check for memory leaks

**Expected:**
- [ ] Chat remains responsive
- [ ] All 10 responses auto-save successfully
- [ ] Toast notifications don't stack excessively
- [ ] No browser slowdown
- [ ] No memory leaks (check DevTools Memory tab)

---

## Test 10: Visual Indicators

**Steps:**
1. Ask a question
2. Observe the message bubble after save

**Expected:**
- [ ] Saved messages have visual indicator (checkmark, badge, etc.)
- [ ] Indicator distinguishes saved from unsaved messages

---

## Test 11: Settings Persistence

**Steps:**
1. Toggle auto-save OFF
2. Close and reopen browser
3. Check settings

**Expected:**
- [ ] Setting persists (still OFF)
- [ ] Auto-save respects saved preference

---

## Test 12: Cross-Browser Testing

**Test in:**
- [ ] Chrome/Chromium
- [ ] Safari
- [ ] Firefox
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

**Verify:**
- [ ] Auto-save works consistently
- [ ] Toast notifications appear
- [ ] IndexedDB storage works
- [ ] No browser-specific errors

---

## Test 13: Edge Cases

**Test 13A: Special Characters**
1. Ask question with emojis, Chinese characters, special symbols
2. Verify saved correctly

**Test 13B: Very Long Query**
1. Ask extremely long question (500+ characters)
2. Verify handles gracefully

**Test 13C: Markdown in Response**
1. Ask question that generates markdown response
2. Verify saved with proper formatting

---

## Regression Tests

**Verify existing functionality still works:**
- [ ] Manual save still works (SaveResearchModal)
- [ ] Chat interface functions normally
- [ ] Bible navigation works
- [ ] Notes display correctly
- [ ] Search functionality works
- [ ] No new console errors or warnings

---

## Known Limitations (Expected Behavior)

These are NOT bugs:
- Duplicate detection window: last 100 saves (resets on app restart)
- Content over 50KB is truncated (performance optimization)
- Auto-save requires JavaScript and IndexedDB (no fallback to cookies)

---

## Success Criteria

✅ All tests pass  
✅ No console errors  
✅ No performance degradation  
✅ Toast notifications work properly  
✅ Auto-save toggle works  
✅ Data persists correctly  
✅ No regressions in existing features

---

## Bug Report Template

If you find a bug, please document:

```markdown
**Bug**: [Brief description]
**Severity**: Critical / High / Medium / Low
**Steps to Reproduce**:
1. 
2. 
3. 

**Expected**:
[What should happen]

**Actual**:
[What actually happened]

**Browser**: [Chrome 120 / Safari 17 / etc.]
**Console Errors**: [Copy any errors]
**Screenshot**: [If applicable]
```

---

## Post-Testing

After all tests complete:
- [ ] Document any bugs found
- [ ] Rate overall feature quality (1-10)
- [ ] Provide feedback on UX
- [ ] Suggest improvements (if any)
- [ ] Approve for merge (if ready) or request changes

---

**Testing Complete!** ✅

Please share results with the development team.
