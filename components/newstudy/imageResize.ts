/**
 * imageResize.ts — downscale a leader's picture for embedding · 图片压缩
 *
 * Picture sections embed the image IN the pack JSON as a data URL
 * (ADR-0027): it syncs, shares and presents with the pack, no storage
 * service. To keep packs small the photo is downscaled client-side to a
 * 1280px long edge and re-encoded as JPEG, dropping quality once before
 * refusing. Pack-level cap: sectionRules.MAX_PACK_PICTURES.
 */
import { NS_IMG_TOO_BIG, NS_IMG_READ_ERR } from './newStudyStrings';

/** Refuse absurd inputs before decoding (a phone photo is well under this). */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
/** Longest edge of the embedded image, px: fills a 1080p TV without waste. */
export const MAX_LONG_EDGE = 1280;
/** Result budget in data-URL chars: ~560k base64 chars ≈ 400KB of JPEG. */
export const MAX_RESULT_CHARS = 560_000;
/** JPEG quality ladder: normal, then one thriftier retry before giving up. */
const QUALITIES = [0.8, 0.6] as const;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(NS_IMG_READ_ERR)); };
    img.src = url;
  });
}

/**
 * File → embedded data URL: decode, scale to MAX_LONG_EDGE, encode as JPEG
 * at 0.8 (then 0.6). Throws bilingually when the input is oversized, cannot
 * be decoded, or still exceeds the result budget at the lowest quality.
 */
export async function downscaleImage(file: File): Promise<string> {
  if (file.size > MAX_INPUT_BYTES) throw new Error(NS_IMG_TOO_BIG);
  const img = await loadImage(file);
  const long = Math.max(img.width, img.height);
  if (!long) throw new Error(NS_IMG_READ_ERR);
  const scale = Math.min(1, MAX_LONG_EDGE / long);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(NS_IMG_READ_ERR);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const quality of QUALITIES) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_RESULT_CHARS) return url;
  }
  throw new Error(NS_IMG_TOO_BIG);
}
