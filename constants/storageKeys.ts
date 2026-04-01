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
  PREFERRED_LAYOUT: 'biblePreferredLayout',

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
  OPENROUTER_API_KEY: 'openrouter_api_key',
  NVIDIA_API_KEY: 'nvidia_api_key',
  DEEPSEEK_API_KEY: 'deepseek_api_key',
  GROQ_API_KEY: 'groq_api_key',
  DASHSCOPE_API_KEY: 'dashscope_api_key',
  MINIMAX_API_KEY: 'minimax_api_key',
  ZHIPU_API_KEY: 'zhipu_api_key',
  ZAI_API_KEY: 'zai_api_key',
  R9S_API_KEY: 'r9s_api_key',
  MOONSHOT_API_KEY: 'moonshot_api_key',
  PERPLEXITY_API_KEY: 'perplexity_api_key',
  AI_PROVIDER: 'ai_provider',
  AI_MODEL: 'ai_model',

  // Device/sync
  DEVICE_ID: 'bible_device_id',
  SYNC_STATE: 'bible-app-sync-state',

  // Vibe / season
  VIBE_STYLES: 'bible_vibe_styles',
  VIBE_CUSTOMIZATIONS: 'bible_vibe_customizations',
  VIBE_CHAT_HISTORY: 'bible_vibe_chat_history',
  SEASON_OVERRIDE: 'bible-app-season-override',

  // Notes view mode
  NOTES_VIEW_MODE: 'bible_notes_view_mode',

  // Legacy migration
  LEGACY_NOTES: 'scripture_scholar_notes',
} as const;
