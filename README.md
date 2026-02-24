<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 圣经学研 Scripture Scholar

**A bilingual Bible study app with AI-powered research, inline handwriting annotations, and seasonal themes.**

🌐 **[Live App →](https://annaxiebot.github.io/bible/)**

</div>

---

## ✨ Features

### 📖 Bilingual Bible Reading
- Side-by-side **Chinese (和合本 CUV)** and **English (WEB)** text
- Traditional/Simplified Chinese toggle
- Chapter navigation with swipe gestures (iOS/iPad)
- Full-text search across all books
- Reading history with resume from last position

### ✏️ Inline Handwriting Annotations
- **Write directly on the Bible** — transparent drawing overlay on verse text
- Optimized for **Apple Pencil** with pressure sensitivity, tilt detection, and 240Hz input capture
- Tools: pen, marker, highlighter, eraser with 8 color presets
- **Expandable margins** — drag to extend up to 2000px of extra writing space below verses
- Annotations saved per chapter and persist across sessions
- Apple Pencil double-tap to toggle eraser

### 🤖 AI Scholar Research
- Powered by **Google Gemini** — bilingual Chinese and English commentary
- Academic-quality verse analysis with scholarly sources
- Save research notes per verse for later review
- Voice session support for spoken study

### 🎨 Seasonal Themes
- Background and accent colors change with the seasons:
  - 🌸 **Spring** — fresh sage greens
  - ☀️ **Summer** — warm golden amber
  - 🍂 **Autumn** — rich harvest orange
  - ❄️ **Winter** — serene cool blues
- Auto-detects season or manually choose in Settings
- Themed paper backgrounds for an immersive reading experience

### 📝 Notes & Bookmarks
- Personal notes per verse with auto-save
- Bookmark favorite verses (♥) with quick navigation from sidebar
- Export/import all notes and data as backup
- Offline Bible download for reading without internet

### ☁️ Google Drive Sync (New!)
- **Automatic backup** of all your notes, bookmarks, and annotations
- **Cross-device sync** — access your data on any device
- **100% your data** — everything stays in your own Google Drive
- **Works offline** — syncs automatically when back online
- **Privacy-first** — no data passes through our servers

📘 **[Setup Guide](GOOGLE_DRIVE_SYNC.md)** — Learn how to enable Google Drive sync

### 📅 Reading Plans
- Built-in reading plans to guide daily Bible study
- Track progress with completion percentage
- Flexible schedule with start/stop controls

---

## 🌐 Live App

**👉 [https://annaxiebot.github.io/bible/](https://annaxiebot.github.io/bible/)**

Works on desktop browsers, iPad, and iPhone. Best experience on iPad with Apple Pencil for handwriting annotations.

---

## 🏗️ Origin

This app was originally created in [Google AI Studio](https://ai.studio/apps/drive/11oSg5tET4z_ig6AK13MydKOrO7Yx9m7z) and has been significantly extended with bilingual support, handwriting annotations, seasonal themes, reading plans, and offline capabilities.

---

## 🚀 Run Locally

**Prerequisites:** Node.js 20+

1. Clone the repo:
   ```bash
   git clone https://github.com/Annaxiebot/bible.git
   cd bible
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set your API keys in `.env.local`:
   ```bash
   # Google Gemini API key (for AI research)
   VITE_GEMINI_API_KEY=your_gemini_key_here
   
   # Google OAuth Client ID (for Drive sync - optional)
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   
   # Google API Key (for Drive API - optional)
   VITE_GOOGLE_API_KEY=your_google_api_key
   ```
   
   📘 See **[GOOGLE_DRIVE_SYNC.md](GOOGLE_DRIVE_SYNC.md)** for Google Drive setup instructions.

4. Run the dev server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000/bible/](http://localhost:3000/bible/) in your browser.

---

## 📦 Build & Deploy

```bash
npm run build
```

The app auto-deploys to GitHub Pages on push to `master` via the included GitHub Actions workflow.

---

## 🛠️ Tech Stack

- **React 19** + TypeScript
- **Vite** for build tooling
- **Google Gemini API** for AI research
- **IndexedDB** (via `idb`) for local storage
- **Canvas API** with pointer events for handwriting
- **Tailwind CSS** (CDN) for styling
- **KaTeX** for mathematical notation
- **GitHub Pages** for deployment

---

## 📄 License

This project is open source. Originally created in Google AI Studio.
# Test auto-deploy
