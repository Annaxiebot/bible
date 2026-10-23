/**
 * ogImage.ts — the 1200×630 social-share image: name, alt text, PNG chunk helpers · 分享图
 *
 * Open Graph / Twitter cards need a raster image (SVG is not accepted). The
 * image is public/og-image.png (Vite copies it to the build root), rendered
 * once from the HTML card in ogCard.ts by `node scripts/seo/render-og-image.mjs`
 * with the site's own OFL web fonts in headless Chromium. 2026-10-23: the old
 * build-time 5×7 pixel font could only draw uppercase Latin, so the card had
 * no Chinese; the owner asked for 活出神的话 first and prominent. The PNG
 * carries the card's sha256 in a tEXt chunk, so a copy change that is not
 * re-rendered fails ogImage.test instead of shipping a stale card (R3).
 */
import { BRAND_EN, BRAND_ZH, HERO_EYEBROW } from '../../components/landing/landingStrings';

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_FILE = 'og-image.png';
/** Chinese first (ADR-0003 §1), like every description it travels with. */
export const OG_IMAGE_ALT =
  `${BRAND_ZH} · ${BRAND_EN} — ${HERO_EYEBROW}：深色背景上的金色大字与同心金环 · large gold lettering beside concentric gold rings on a dark background`;
/** tEXt keyword under which the PNG records the sha256 of the card HTML it was rendered from. */
export const OG_CARD_HASH_KEY = 'stl-og-card-sha256';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface PngChunk { type: string; data: Buffer; crcOk: boolean }

/** The chunks of a PNG, in order (throws on a bad signature or a truncated chunk). */
export function pngChunks(png: Buffer): PngChunk[] {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');
  const chunks: PngChunk[] = [];
  let at = 8;
  while (at < png.length) {
    if (at + 12 > png.length) throw new Error('truncated PNG chunk');
    const len = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    const end = at + 8 + len;
    if (end + 4 > png.length) throw new Error(`truncated PNG chunk ${type}`);
    const crcOk = png.readUInt32BE(end) === crc32(png.subarray(at + 4, end));
    chunks.push({ type, data: png.subarray(at + 8, end), crcOk });
    at = end + 4;
  }
  return chunks;
}

/** tEXt keyword → text of a PNG. */
export function pngText(png: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of pngChunks(png)) {
    if (c.type !== 'tEXt') continue;
    const nul = c.data.indexOf(0);
    if (nul > 0) out[c.data.toString('latin1', 0, nul)] = c.data.toString('latin1', nul + 1);
  }
  return out;
}

/** The PNG with one more tEXt chunk, placed just before IEND. */
export function withPngText(png: Buffer, keyword: string, text: string): Buffer {
  const iend = png.length - 12;
  if (png.toString('ascii', iend + 4, iend + 8) !== 'IEND') throw new Error('PNG does not end with IEND');
  const body = Buffer.concat([Buffer.from('tEXt', 'ascii'), Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length - 4);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([png.subarray(0, iend), len, body, crc, png.subarray(iend)]);
}
