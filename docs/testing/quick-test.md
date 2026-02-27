# Quick Test Guide - Chinese Bible References

## ⚡ Quick Test (2 minutes)

### Open the App
http://localhost:3000/bible/

### Go to Chat Interface
Click the AI/Chat tab

### Paste This Test:
```
请帮我查看以下经文：
- 申命记26:3
- 创世记1:1-3
- 约翰福音3:16
- 罗马书8:28-30

参考 Genesis 1:1 和 马太福音5:3-10 也很重要。
```

### Expected Result:
All references should be **blue, underlined, and clickable**:
- 申命记26:3 ✓
- 创世记1:1-3 ✓
- 约翰福音3:16 ✓
- 罗马书8:28-30 ✓
- Genesis 1:1 ✓
- 马太福音5:3-10 ✓

### Click Any Reference:
Should navigate to that book, chapter, and highlight the verse(s).

---

## 📝 More Test Cases

### Old Testament Books:
```
创世记1:1, 出埃及记20:3-17, 诗篇23:1-6, 以赛亚书53:5
```

### New Testament Books:
```
马太福音5:3, 路加福音10:27, 使徒行传2:38, 启示录22:21
```

### Multi-Part Books:
```
撒母耳记上17:45, 列王纪下5:14, 哥林多前书13:4-7
```

### Verse Ranges:
```
创世记1:1-10 (range of 10 verses)
罗马书8:1-4 (range of 4 verses)
```

---

## 🐛 If It Doesn't Work

### Check:
1. Dev server is running: `ps aux | grep vite`
2. No console errors in browser DevTools
3. Clear browser cache and reload
4. Check that you're on the Chat/AI tab, not the reader tab

### Restart Dev Server:
```bash
cd bible-app
npm run dev
```

---

## ✅ Success Criteria

- [x] Chinese references are blue and underlined
- [x] Clicking navigates to correct verse
- [x] English references still work
- [x] Mixed text works (Chinese + English)
- [x] Verse ranges select all verses
- [x] All 66 books supported

If all checks pass: **Implementation successful!** 🎉
