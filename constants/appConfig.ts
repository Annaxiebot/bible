/**
 * Application-wide named constants.
 *
 * Replace magic number literals in source files with these exports so that
 * meaning is explicit and values are maintained in a single place.
 */

// ── Image processing ────────────────────────────────────────────────────────

export const IMAGE = {
  /** Maximum pixel dimension (width or height) before scaling down */
  MAX_DIMENSION: 1200,
  /** Maximum compressed byte size for images sent to the AI (3.5 MB) */
  MAX_BYTES: 3.5 * 1024 * 1024,
  /** Starting JPEG quality for compression loop */
  INITIAL_QUALITY: 0.8,
  /** Minimum JPEG quality before the compression loop stops */
  MIN_QUALITY: 0.2,
  /** JPEG quality used when capturing a thumbnail / webcam snapshot */
  THUMBNAIL_QUALITY: 0.85,
  /** Minimum base64 string length that indicates a real drawing (not empty) */
  DRAWING_MIN_LENGTH: 200,
} as const;

// ── Timing (milliseconds) ───────────────────────────────────────────────────

export const TIMING = {
  /** Maximum gap between two pen-down events to be counted as a double-tap */
  DOUBLE_TAP_MS: 300,
  /** Minimum gap between two pen-down events to avoid accidental double-tap */
  DOUBLE_TAP_MIN_INTERVAL: 50,
  /** Debounce delay for scroll-into-view after navigation */
  SCROLL_RETRY_MS: 100,
  /** Short delay used after layout changes (e.g. focus, cursor placement) */
  SHORT_DELAY_MS: 50,
  /** Auto-save debounce for the notebook editor */
  AUTO_SAVE_DEBOUNCE_MS: 2000,
  /** Toast display duration for success messages */
  TOAST_SUCCESS_MS: 2000,
  /** Toast display duration for error messages */
  TOAST_ERROR_MS: 3000,
  /** Threshold (ms) of user inactivity before reverting to read mode */
  INACTIVITY_THRESHOLD_MS: 2 * 60 * 1000,
  /** Polling interval while waiting for a paused/API-blocked download */
  DOWNLOAD_POLL_MS: 500,
  /** Rate-limit back-off delay for background Bible downloads */
  BG_DOWNLOAD_DELAY_MS: 5000,
  /** Extra pause injected when an AI/research API call is detected */
  BG_DOWNLOAD_API_PAUSE_MS: 10000,
  /** Rate-limit 429 back-off for background download retries */
  BG_DOWNLOAD_RATE_LIMIT_MS: 30000,
  /** Delay between chapter downloads when doing a manual full-Bible download */
  MANUAL_DOWNLOAD_CHAPTER_DELAY_MS: 2000,
  /** Shorter delay between chapter downloads during the auto-download flow */
  AUTO_DOWNLOAD_CHAPTER_DELAY_MS: 800,
  /** Delay between the two translations for the same chapter */
  MANUAL_DOWNLOAD_TRANSLATION_DELAY_MS: 2000,
  /** Retry delay inside chapter-download retry loops */
  DOWNLOAD_RETRY_DELAY_MS: 1000,
  /** Longer retry delay inside download retry loops (network error) */
  DOWNLOAD_RETRY_LONG_DELAY_MS: 3000,
  /** Delay before auto-triggering window.print() in a print window */
  PRINT_WINDOW_DELAY_MS: 500,
  /** Polling interval (ms) while waiting for a video generation operation */
  VIDEO_POLL_MS: 10000,
} as const;

// ── Audio ───────────────────────────────────────────────────────────────────

export const AUDIO = {
  /** Sample rate (Hz) expected by the Gemini TTS audio decoder */
  SAMPLE_RATE: 24000,
  /** PCM int16 max amplitude; used for normalising to [-1, 1] float */
  PCM_INT16_MAX: 32768,
} as const;

// ── Download / retry ────────────────────────────────────────────────────────

export const DOWNLOAD = {
  /** Maximum number of per-chapter download attempts before giving up */
  MAX_RETRIES: 3,
  /** Progress-save interval (every N translation-downloads completed) */
  PROGRESS_SAVE_INTERVAL: 10,
  /** Number of chapters kept in the localStorage hot cache before eviction */
  CACHE_KEEP_NEWEST: 100,
  /** Small inter-chapter delay (ms) in bibleCache download helpers */
  CACHE_DOWNLOAD_DELAY_MS: 100,
} as const;

// ── AI / Gemini ─────────────────────────────────────────────────────────────

export const AI = {
  /** Thinking token budget for the pro-preview model */
  THINKING_BUDGET: 32768,
  /** Base wait (ms) on first rate-limit retry */
  RATE_LIMIT_WAIT_ATTEMPT_0: 2000,
  /** Base wait (ms) on second rate-limit retry */
  RATE_LIMIT_WAIT_ATTEMPT_1: 5000,
  /** Base wait (ms) on third (final) rate-limit retry */
  RATE_LIMIT_WAIT_ATTEMPT_2: 10000,
  /** Maximum number of retry attempts on a rate-limited AI request */
  MAX_RETRIES: 3,
} as const;

// ── Layout ──────────────────────────────────────────────────────────────────

export const LAYOUT = {
  /** Default font size in pixels for Bible reading view */
  DEFAULT_FONT_SIZE: 18,
  /** Minimum selectable font size */
  MIN_FONT_SIZE: 12,
  /** Maximum selectable font size */
  MAX_FONT_SIZE: 28,
  /** Default split-pane offset (%) — 100 % hides the English panel */
  DEFAULT_SPLIT_OFFSET: 100,
  /** Split offset (%) representing centred divider */
  CENTRE_SPLIT_OFFSET: 50,
  /** Split offset (%) representing fully-expanded English panel */
  ENGLISH_FULL_SPLIT_OFFSET: 0,
} as const;

// ── Swipe navigation ────────────────────────────────────────────────────────

export const SWIPE = {
  /** Minimum horizontal travel (px) to trigger a chapter navigation */
  THRESHOLD_PX: 100,
  /** Minimum movement (px) before locking swipe direction */
  DIRECTION_LOCK_PX: 10,
} as const;

// ── Drawing canvas ──────────────────────────────────────────────────────────

export const DRAWING = {
  /** Touch-reset delay (ms) after a touch-end event on the drawing canvas */
  TOUCH_RESET_DELAY_MS: 100,
  /** Default brush size */
  DEFAULT_SIZE: 2,
  /** Eraser width multiplier relative to brush size */
  ERASER_WIDTH_MULTIPLIER: 4,
  /** Highlighter width multiplier relative to brush size */
  HIGHLIGHTER_WIDTH_MULTIPLIER: 5,
  /** Highlighter opacity */
  HIGHLIGHTER_ALPHA: 0.25,
  /** Marker opacity */
  MARKER_ALPHA: 0.7,
  /** Marker width multiplier relative to computed line width */
  MARKER_WIDTH_MULTIPLIER: 2.5,
  /** Pressure floor used when no pressure data is available */
  DEFAULT_PRESSURE: 0.5,
  /** Minimum pressure contribution factor */
  PRESSURE_MIN_FACTOR: 0.1,
  /** Maximum pressure scaling range */
  PRESSURE_MAX_FACTOR: 1.8,
  /** Tilt angle (degrees) above which tilt is factored into line width */
  TILT_THRESHOLD_DEG: 15,
  /** Divisor for converting tilt angle to a width factor */
  TILT_DIVISOR: 180,
  /** Canvas render height (px) used when producing annotation print images */
  PRINT_RENDER_HEIGHT: 4000,
  /** Palm rejection: Maximum touch radius threshold (Apple Pencil ~<5, finger ~10-20, palm ~30+) */
  PALM_REJECTION_RADIUS: 25,
} as const;

// ── Auto-save research ──────────────────────────────────────────────────────

export const AUTO_SAVE = {
  /** Maximum response size (bytes / chars) stored per research entry (50 KB) */
  MAX_RESPONSE_SIZE: 50000,
  /** Number of response hashes kept in-memory for duplicate detection */
  DUPLICATE_CACHE_SIZE: 100,
  /** Prefix used for the content hash (first N chars of response) */
  HASH_PREVIEW_LENGTH: 200,
} as const;

// ── Print service ───────────────────────────────────────────────────────────

export const PRINT = {
  /** Minimum drawing string length to be included in print output */
  DRAWING_MIN_LENGTH: 200,
  /** Minimum note count before a table-of-contents is generated */
  TOC_MIN_NOTES: 5,
  /** Canvas render width (px) for notebook drawings in print output */
  DRAWING_RENDER_WIDTH: 600,
  /** Canvas render height (px) for notebook drawings in print output */
  DRAWING_RENDER_HEIGHT: 400,
} as const;
