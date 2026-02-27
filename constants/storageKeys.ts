export const STORAGE_KEYS = {
  // Reading history
  READING_HISTORY: 'bibleReadingHistory',
  LAST_READ: 'bibleLastRead',
  CHAPTER_HISTORY: 'bibleChapterHistory',

  // User preferences
  ENGLISH_VERSION: 'bibleEnglishVersion',
  CHINESE_MODE: 'bibleChineseMode',
  FONT_SIZE: 'bibleFontSize',
  VIEW_LAYOUT: 'bibleViewLayout',

  // Auto-save
  AUTO_SAVE_RESEARCH: 'auto_save_research',

  // Bible cache
  BIBLE_CACHE_PREFIX: 'bible_cache_',
  BIBLE_CACHE_INDEX: 'bible_cache_index',

  // API keys
  GEMINI_API_KEY: 'gemini_api_key',
  CLAUDE_API_KEY: 'claude_api_key',
  OPENAI_API_KEY: 'openai_api_key',
  KIMI_API_KEY: 'kimi_api_key',
  AI_PROVIDER: 'ai_provider',
  AI_MODEL: 'ai_model',

  // Device/sync
  DEVICE_ID: 'bible_device_id',
  SYNC_STATE: 'bible-app-sync-state',

  // Vibe / season
  VIBE_STYLES: 'bible_vibe_styles',
  SEASON_OVERRIDE: 'bible-app-season-override',

  // Legacy migration
  LEGACY_NOTES: 'scripture_scholar_notes',
} as const;
