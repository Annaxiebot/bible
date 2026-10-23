/**
 * ogImage.ts — the 1200×630 social-share image, drawn at build time · 分享图
 *
 * Open Graph / Twitter cards need a raster image (SVG is not accepted), and
 * the build has no image tooling, so this draws one deterministically: the
 * landing's night background, its concentric gold rings, and the wordmark in
 * a 5×7 pixel font — then encodes a plain RGB PNG with node:zlib. Same bytes
 * every build (tests pin the format, not the pixels).
 */
import { deflateSync } from 'node:zlib';

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_FILE = 'og-image.png';
export const OG_IMAGE_ALT = 'Scripture to Life — Bilingual group Bible study: gold lettering beside concentric gold rings on a dark background';

type RGB = [number, number, number];

const BG_TOP: RGB = [24, 20, 16];
const BG_BOTTOM: RGB = [40, 31, 22];
const GOLD: RGB = [232, 184, 92];
const GOLD_PALE: RGB = [242, 223, 180];
const RING: RGB = [150, 116, 60];

/** 5×7 glyphs, one string of five 0/1 per row. Only the letters the card uses. */
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
}

function drawText(px: Uint8Array, text: string, x0: number, y0: number, scale: number, color: RGB): void {
  let x = x0;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) throw new Error(`ogImage: no glyph for ${JSON.stringify(ch)}`);
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const X = x + gx * scale + dx;
            const Y = y0 + gy * scale + dy;
            if (X < 0 || Y < 0 || X >= OG_IMAGE_WIDTH || Y >= OG_IMAGE_HEIGHT) continue;
            const o = (Y * OG_IMAGE_WIDTH + X) * 3;
            px[o] = color[0]; px[o + 1] = color[1]; px[o + 2] = color[2];
          }
        }
      }
    }
    x += 6 * scale;
  }
}

/** Raw RGB pixels of the card. */
export function drawOgPixels(): Uint8Array {
  const W = OG_IMAGE_WIDTH, H = OG_IMAGE_HEIGHT;
  const px = new Uint8Array(W * H * 3);
  const cx = 1010, cy = 315;
  const radii = [110, 190, 270, 350, 430, 510, 590];
  for (let y = 0; y < H; y++) {
    const bg = mix(BG_TOP, BG_BOTTOM, y / (H - 1));
    for (let x = 0; x < W; x++) {
      let c = bg;
      const d = Math.hypot(x - cx, y - cy);
      for (const r of radii) {
        const edge = Math.abs(d - r);
        if (edge < 2) {
          // Rings fade toward the outside, like the landing hero.
          const strength = (1 - edge / 2) * (1 - r / 700);
          c = mix(c, RING, strength);
        }
      }
      const o = (y * W + x) * 3;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
    }
  }
  drawText(px, 'SCRIPTURE TO LIFE', 80, 200, 10, GOLD);
  drawText(px, 'BILINGUAL GROUP BIBLE STUDY', 84, 320, 5, GOLD_PALE);
  drawText(px, 'SCRIPTURETOLIFE.ORG', 84, 470, 4, GOLD);
  return px;
}

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

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode RGB pixels as an 8-bit truecolour PNG. */
export function encodePng(px: Uint8Array, width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    Buffer.from(px.buffer, px.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

let cached: Buffer | null = null;

/** The social image's PNG bytes (computed once per process). */
export function ogImagePng(): Buffer {
  if (!cached) cached = encodePng(drawOgPixels(), OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT);
  return cached;
}
