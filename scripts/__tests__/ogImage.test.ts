/** ogImage — the social card is a valid 1200×630 PNG (Open Graph / Twitter need a raster image). */
import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { ogImagePng, crc32, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from '../seo/ogImage';

describe('ogImagePng', () => {
  const png = ogImagePng();

  it('has the PNG signature and a 1200×630 RGB header', () => {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.toString('ascii', 12, 16)).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(OG_IMAGE_WIDTH);
    expect(png.readUInt32BE(20)).toBe(OG_IMAGE_HEIGHT);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(2);
  });

  it('every chunk CRC is valid, it ends with IEND, and the pixels decompress to the right size', () => {
    let at = 8;
    const types: string[] = [];
    let idat = Buffer.alloc(0);
    while (at < png.length) {
      const len = png.readUInt32BE(at);
      const type = png.toString('ascii', at + 4, at + 8);
      const data = png.subarray(at + 8, at + 8 + len);
      expect(png.readUInt32BE(at + 8 + len)).toBe(crc32(png.subarray(at + 4, at + 8 + len)));
      if (type === 'IDAT') idat = Buffer.concat([idat, data]);
      types.push(type);
      at += 12 + len;
    }
    expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(inflateSync(idat).length).toBe((OG_IMAGE_WIDTH * 3 + 1) * OG_IMAGE_HEIGHT);
  });

  it('is small enough for social crawlers (< 1 MB) and not a blank image', () => {
    expect(png.length).toBeLessThan(1_000_000);
    // One IDAT: after signature (8) + IHDR chunk (25) + IDAT length/type (8); before its CRC (4) + IEND (12).
    const raw = inflateSync(png.subarray(41, png.length - 16));
    expect(new Set(raw.subarray(0, 50_000)).size).toBeGreaterThan(5);
  });
});
