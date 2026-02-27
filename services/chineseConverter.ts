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
 */

import * as opencc from 'opencc-js';

// Converters are created once and reused — initialisation is synchronous
const _toSimp = opencc.Converter({ from: 'tw', to: 'cn' });
const _toTrad = opencc.Converter({ from: 'cn', to: 'tw' });

export const toSimplified = (text: string): string => _toSimp(text);
export const toTraditional = (text: string): string => _toTrad(text);
