// =====================================================
// API CONSTANTS
// =====================================================

export const BIBLE_API_BASE_URL = 'https://bible-api.com';

export const API_CONSTANTS = {
  REQUEST_TIMEOUT: 10000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  BATCH_SIZE: 5,
  CACHE_DURATION: 86400000, // 24 hours in ms
} as const;

// =====================================================
// UI CONSTANTS
// =====================================================

export const UI_CONSTANTS = {
  // Layout
  SIDEBAR_WIDTH: 280,
  MOBILE_BREAKPOINT: 768,
  TABLET_BREAKPOINT: 1024,
  
  // Typography
  DEFAULT_FONT_SIZE: 18,
  MIN_FONT_SIZE: 12,
  MAX_FONT_SIZE: 32,
  FONT_SIZE_STEP: 2,
  
  // Gestures
  SWIPE_THRESHOLD: 100,
  SWIPE_VELOCITY_THRESHOLD: 0.5,
  LONG_PRESS_DURATION: 500,
  TAP_DELAY: 300,
  
  // Animation
  PAGE_FLIP_DURATION: 300,
  FADE_DURATION: 200,
  TOAST_DURATION: 4000,
  
  // Z-index layers
  Z_INDEX: {
    BASE: 1,
    DROPDOWN: 10,
    STICKY: 20,
    MODAL_BACKDROP: 40,
    MODAL: 50,
    NOTES_DIALOG: 70,
    SIDEBAR: 900,
    CONTEXT_MENU: 950,
    TOAST: 1100,
  },
  
  // Drawing
  DEFAULT_PEN_SIZE: 3,
  MIN_PEN_SIZE: 1,
  MAX_PEN_SIZE: 20,
  DEFAULT_PEN_COLOR: '#000000',
  DEFAULT_ERASER_SIZE: 20,
} as const;

// =====================================================
// STORAGE CONSTANTS
// =====================================================

export const STORAGE_CONSTANTS = {
  DB_NAME: 'BibleAppDB',
  DB_VERSION: 1,
  
  STORES: {
    VERSES: 'verses',
    NOTES: 'notes',
    BOOKMARKS: 'bookmarks',
    ANNOTATIONS: 'annotations',
    RESEARCH: 'research',
    READING_HISTORY: 'reading_history',
  },
  
  KEYS: {
    BIBLE_FONT_SIZE: 'bibleFontSize',
    CHINESE_MODE: 'bibleChineseMode',
    LAST_BOOK: 'lastBookId',
    LAST_CHAPTER: 'lastChapter',
    LAST_VERSE: 'lastVerse',
    SELECTED_BIBLE_VERSION: 'selectedBibleVersion',
    SIDEBAR_OPEN: 'sidebarOpen',
    SPLIT_VERTICAL: 'splitVertical',
    SPLIT_HORIZONTAL: 'splitHorizontal',
    THEME_MODE: 'themeMode',
    SYNC_STATE: 'syncState',
    USER_ID: 'userId',
    AUTH_TOKEN: 'authToken',
  }
} as const;

// =====================================================
// CHINESE CONVERSION
// =====================================================

export const CHINESE_MODE = {
  SIMPLIFIED: 'simplified',
  TRADITIONAL: 'traditional'
} as const;

export type ChineseMode = typeof CHINESE_MODE[keyof typeof CHINESE_MODE];

// =====================================================
// THEME CONSTANTS
// =====================================================

export const THEME = {
  LIGHT: 'light',
  DARK: 'dark',
  SEPIA: 'sepia',
  AUTO: 'auto'
} as const;

export type ThemeMode = typeof THEME[keyof typeof THEME];

// =====================================================
// AI MODEL CONSTANTS
// =====================================================

export const AI_MODELS = {
  // Gemini models
  GEMINI_FLASH: 'gemini-flash-lite-latest',
  GEMINI_PRO: 'gemini-3-pro-preview',
  GEMINI_FLASH_8B: 'gemini-2.0-flash-8b',
  
  // Claude models
  CLAUDE_SONNET: 'claude-sonnet-4-5',
  CLAUDE_OPUS: 'claude-opus-4-5',
  CLAUDE_HAIKU: 'claude-haiku-4-5',
} as const;

export type AIModel = typeof AI_MODELS[keyof typeof AI_MODELS];

// =====================================================
// TIMING CONSTANTS
// =====================================================

export const TIMING = {
  DEBOUNCE_DELAY: 500,
  AUTO_SAVE_DELAY: 2000,
  SYNC_INTERVAL: 300000, // 5 minutes
  IDLE_TIMESTAMP_THRESHOLD: 120000, // 2 minutes
  SCROLL_RETRY_DELAY: 300,
  SCROLL_MAX_ATTEMPTS: 10,
} as const;

// =====================================================
// DOWNLOAD CONSTANTS
// =====================================================

export const DOWNLOAD_CONSTANTS = {
  CHUNK_SIZE: 5, // chapters per batch
  DELAY_BETWEEN_CHUNKS: 1000, // ms
  MAX_CONCURRENT_DOWNLOADS: 3,
} as const;

// =====================================================
// BIBLE VERSION CONSTANTS
// =====================================================

export const BIBLE_VERSIONS = {
  CUV: 'cuv',    // Chinese Union Version
  WEB: 'web',    // World English Bible
  KJV: 'kjv',    // King James Version
  NIV: 'niv',    // New International Version
} as const;

export type BibleVersion = typeof BIBLE_VERSIONS[keyof typeof BIBLE_VERSIONS];

export const DEFAULT_VALUES = {
  BIBLE_VERSION: BIBLE_VERSIONS.CUV,
  FONT_SIZE: UI_CONSTANTS.DEFAULT_FONT_SIZE,
  PEN_SIZE: UI_CONSTANTS.DEFAULT_PEN_SIZE,
  PEN_COLOR: UI_CONSTANTS.DEFAULT_PEN_COLOR,
  CHINESE_MODE: CHINESE_MODE.SIMPLIFIED,
  THEME: THEME.LIGHT,
} as const;
