/**
 * Chinese Character Converter
 *
 * Converts between Traditional Chinese (CUV Bible text uses Taiwan/HK standard)
 * and Simplified Chinese using the opencc-js library, which implements the full
 * OpenCC dictionary (~7,000+ character mappings vs the previous 291-entry table).
 *
 * Locales used:
 *   tw → cn  : Traditional (Taiwan) to Simplified
 *   cn → tw  : Simplified to Traditional (Taiwan)
 *
 * Lazy-loaded: the 1MB+ dictionary is only imported when first conversion is requested.
 */

let _toSimp: ((text: string) => string) | null = null;
let _toTrad: ((text: string) => string) | null = null;
let _loadPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (_toSimp && _toTrad) return;
  if (!_loadPromise) {
    _loadPromise = import('opencc-js').then((opencc) => {
      _toSimp = opencc.Converter({ from: 'tw', to: 'cn' });
      _toTrad = opencc.Converter({ from: 'cn', to: 'tw' });
    });
  }
  await _loadPromise;
}

/** Convert Traditional Chinese to Simplified. Loads dictionary on first call. */
export const toSimplified = (text: string): string => {
  if (_toSimp) return _toSimp(text);
  // Fallback: trigger async load, return original text this time
  ensureLoaded();
  return text;
};

/** Convert Simplified Chinese to Traditional. Loads dictionary on first call. */
export const toTraditional = (text: string): string => {
  if (_toTrad) return _toTrad(text);
  ensureLoaded();
  return text;
};

/** Pre-load the converter (call on app init or when user enables simplified mode). */
export const preloadConverter = (): Promise<void> => ensureLoaded();
