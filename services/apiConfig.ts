/**
 * Bible API base URL.
 * - In development: routes through Vite proxy (/bible-api) to avoid CORS on localhost
 * - In production (GitHub Pages): uses the direct URL
 */
export const BIBLE_API_BASE = import.meta.env.DEV
  ? '/bible-api'
  : 'https://bible-api.com';
