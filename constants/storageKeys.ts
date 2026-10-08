export const STORAGE_KEYS = {
  // Reading history
  READING_HISTORY: 'bibleReadingHistory',
  LAST_READ: 'bibleLastRead',
  CHAPTER_HISTORY: 'bibleChapterHistory',

  // User preferences
  ENGLISH_VERSION: 'bibleEnglishVersion',
  CHINESE_VERSION: 'bibleChineseVersion',
  CHINESE_MODE: 'bibleChineseMode',
  FONT_SIZE: 'bibleFontSize',
  VIEW_LAYOUT: 'bibleViewLayout',
  PREFERRED_LAYOUT: 'biblePreferredLayout',

  // Auto-save
  AUTO_SAVE_RESEARCH: 'auto_save_research',

  // Bible cache
  BIBLE_CACHE_PREFIX: 'bible_cache_',
  BIBLE_CACHE_INDEX: 'bible_cache_index',

  // The user's own OpenRouter key — the hidden "Advanced" own-key path (services/openrouter getApiKey).
  // Keys of the removed direct providers are cleared on start: services/obsoleteStorageKeys.ts.
  OPENROUTER_API_KEY: 'openrouter_api_key',
  AI_PROVIDER: 'ai_provider',
  AI_MODEL: 'ai_model',
  // #/setup "模型 Models" rows: pack-generation model id; Ask-AI fallback ids, comma-separated (services/aiDefaults readers)
  AI_PACK_MODEL: 'ai_pack_model',
  AI_FALLBACK_MODELS: 'ai_fallback_models',

  // New study: the leader's last "内容语言 Content language" choice (the form's default next time)
  CONTENT_LANGUAGE_DEFAULT: 'content_language_default',

  // TV mode: the one-time "按 F 全屏 Press F for full screen" / "横屏 sideways" hint was shown on this device
  TV_FULLSCREEN_HINT_SEEN: 'tv_fullscreen_hint_seen',

  // New study: the first-visit "三步 Three steps" card was dismissed with 知道了 Got it (this device only, not synced)
  NEW_STUDY_GUIDE_DISMISSED: 'new_study_guide_dismissed',

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

  // Sign-up: the member's own contact details, kept on their phone only (never synced)
  SIGNUP_MEMBER: 'stl_signup_member',
} as const;

/** The value NEW_STUDY_GUIDE_DISMISSED holds once the first-visit card was dismissed (one place, R3). */
export const NEW_STUDY_GUIDE_DISMISSED_VALUE = '1';
