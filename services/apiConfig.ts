/**
 * Bible API base URL.
 * - In development: routes through Vite proxy (/bible-api) to avoid CORS on localhost
 * - In production (GitHub Pages): uses the direct URL
 */
export const BIBLE_API_BASE = import.meta.env.DEV
  ? '/bible-api'
  : 'https://bible-api.com';

/**
 * Build a chapter fetch URL for bible-api.com.
 *
 * Single-chapter books (Obadiah, Philemon, 2 John, 3 John, Jude) require an
 * explicit verse range — e.g. `OBA+1:1-21` — because the API parses `OBA1`
 * as "verse 1 of Obadiah" rather than "chapter 1 of Obadiah".
 */
export function buildChapterUrl(
  bookId: string,
  chapter: number,
  translation: string,
  totalVerses?: number
): string {
  const path = totalVerses
    ? `${bookId}+${chapter}:1-${totalVerses}`
    : `${bookId}${chapter}`;
  return `${BIBLE_API_BASE}/${path}?translation=${translation}`;
}
