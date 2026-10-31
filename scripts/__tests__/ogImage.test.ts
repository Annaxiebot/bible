/**
 * ogImage — public/og-image.png is a valid 1200×630 PNG (Open Graph / Twitter
 * need a raster image) rendered from the CURRENT card: it records the sha256
 * of the ogCardHtml() it came from, so a change to the card or to a string it
 * shows fails here until `node scripts/seo/render-og-image.mjs` is re-run.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import {
  OG_IMAGE_FILE, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, OG_CARD_HASH_KEY, pngChunks, pngText, withPngText,
} from '../seo/ogImage';
import { ogCardHash } from '../seo/ogCard';

const png = fs.readFileSync(path.resolve(__dirname, '../../public', OG_IMAGE_FILE));

describe('public/og-image.png', () => {
  it('is a 1200×630 8-bit PNG with valid chunk CRCs, ending in IEND', () => {
    const chunks = pngChunks(png);
    expect(chunks[0].type).toBe('IHDR');
    expect(chunks[0].data.readUInt32BE(0)).toBe(OG_IMAGE_WIDTH);
    expect(chunks[0].data.readUInt32BE(4)).toBe(OG_IMAGE_HEIGHT);
    expect(chunks[0].data[8]).toBe(8);
    expect(chunks.every(c => c.crcOk)).toBe(true);
    expect(chunks.at(-1)!.type).toBe('IEND');
    expect(chunks.some(c => c.type === 'IDAT')).toBe(true);
  });

  it('was rendered from the current card (re-run scripts/seo/render-og-image.mjs if not)', () => {
    expect(pngText(png)[OG_CARD_HASH_KEY]).toBe(ogCardHash());
  });

  it('is small enough for social crawlers and not a blank image', () => {
    expect(png.length).toBeLessThan(1_000_000);
    const idat = Buffer.concat(pngChunks(png).filter(c => c.type === 'IDAT').map(c => c.data));
    const raw = inflateSync(idat);
    expect(new Set(raw.subarray(0, 200_000)).size).toBeGreaterThan(20);
  });
});

describe('PNG text chunk helpers', () => {
  it('withPngText adds a readable tEXt chunk before IEND and keeps every CRC valid', () => {
    const base = withPngText(png, 'probe', 'one');
    const out = withPngText(base, 'second', 'two');
    expect(pngText(out)).toMatchObject({ probe: 'one', second: 'two' });
    const chunks = pngChunks(out);
    expect(chunks.every(c => c.crcOk)).toBe(true);
    expect(chunks.at(-1)!.type).toBe('IEND');
  });

  it('pngChunks refuses a non-PNG and a truncated PNG', () => {
    expect(() => pngChunks(Buffer.from('not a png at all'))).toThrow(/not a PNG/);
    expect(() => pngChunks(png.subarray(0, 40))).toThrow(/truncated/);
  });
});
