/**
 * picture.test.tsx — picture sections end to end of the pure layer
 * (ADR-0027): the rules (addable anywhere between head and tail, 5-pack
 * cap), the slide (one per filled section, none when blank), the schema
 * round-trip at v4, the downscaler's contract against a mocked canvas, and
 * the editor control (pick/URL/caption).
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import {
  parseStudyPack, isPackPicture, PackSection, StudyPack, PACK_SCHEMA_VERSION,
} from '../../studypack/packTypes';
import { buildSlides } from '../../studypack/packSlides';
import {
  canAdd, defaultSection, insertPosition, validateSectionOrder, MAX_PACK_PICTURES,
} from '../sectionRules';
import { downscaleImage, MAX_INPUT_BYTES, MAX_RESULT_CHARS } from '../imageResize';
import { NS_IMG_TOO_BIG, NS_IMG_URL, NS_IMG_CAPTION, NS_IMG_PICK } from '../newStudyStrings';
import SectionEditor from '../SectionEditor';

const title: PackSection = { kind: 'title', heading: 't' };
const scripture: PackSection = {
  kind: 'scripture', heading: 'sc', verses: [{ num: 1, cuv: '经文', en: 'verse' }],
};
const qr: PackSection = { kind: 'qr', heading: 'q' };
const pictureSection = (src: string, caption?: string): PackSection =>
  ({ kind: 'picture', heading: '图片 Picture', picture: { src, caption } });

const pack = (sections: PackSection[]): StudyPack => ({
  id: 'p1', title: 't', date: '2026-10-31', passageRef: 'r', enVersion: 'BSB', sections,
});

describe('picture section rules', () => {
  it('is addable anywhere between head and tail, up to the 5-picture cap', () => {
    const base = [title, scripture, qr];
    expect(canAdd(base, 'picture')).toBe(true);
    expect(insertPosition(base, 'picture')).toBe(2); // before the qr tail
    const full = [title, scripture, ...Array.from({ length: MAX_PACK_PICTURES }, () => pictureSection('x')), qr];
    expect(validateSectionOrder(full)).toBeNull();
    expect(canAdd(full, 'picture')).toBe(false);
    expect(canAdd(full.slice(0, -1), 'picture')).toBe(false); // the cap holds with no tail present too
  });
  it('defaultSection starts blank and parses (mid-edit state is saveable)', () => {
    const fresh = defaultSection('picture');
    expect(fresh.picture).toEqual({ src: '', caption: '' });
    expect(() => parseStudyPack(pack([title, scripture, fresh, qr]))).not.toThrow();
  });
  it('isPackPicture: src required (may be \'\'), caption optional, junk rejected', () => {
    expect(isPackPicture({ src: '' })).toBe(true);
    expect(isPackPicture({ src: 'data:image/jpeg;base64,x', caption: '约旦河 Jordan' })).toBe(true);
    expect(isPackPicture({ caption: 'no src' })).toBe(false);
    expect(isPackPicture({ src: 42 })).toBe(false);
    expect(isPackPicture(null)).toBe(false);
  });
});

describe('picture slides', () => {
  it('a filled section is one slide; a blank one is no slide; the pack round-trips at v4', () => {
    const p = pack([title, scripture, pictureSection('data:image/jpeg;base64,abc', '地图 Map'), pictureSection(''), qr]);
    const reparsed = parseStudyPack(JSON.parse(JSON.stringify(p)));
    const slides = buildSlides(reparsed);
    const pictures = slides.filter(s => s.kind === 'picture');
    expect(pictures).toHaveLength(1);
    expect(pictures[0].picture).toEqual({ src: 'data:image/jpeg;base64,abc', caption: '地图 Map' });
    expect(PACK_SCHEMA_VERSION).toBe(4);
  });
  it('a picture section without its picture object fails parse with context', () => {
    const broken = { ...pack([title, scripture, qr]), sections: [title, { kind: 'picture', heading: 'x' }, qr] };
    expect(() => parseStudyPack(broken)).toThrow(/picture section 1/);
  });
});

describe('downscaleImage', () => {
  // jsdom has no real decoder or canvas encoder: mock Image to "decode" to a
  // fixed size and canvas to report its encode length, which is the whole
  // contract downscaleImage owns (scaling math + the size ladder).
  function mockDecode(width: number, height: number, encodedLength: number) {
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = width; height = height;
      set src(_v: string) { queueMicrotask(() => this.onload?.()); }
    });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const sizes: Array<{ w: number; h: number }> = [];
    HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
      return { drawImage: () => sizes.push({ w: this.width, h: this.height }) };
    }) as never;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'd'.repeat(encodedLength));
    return sizes;
  }
  afterEach(() => vi.unstubAllGlobals());

  it('scales a 4000×3000 photo to a 1280px long edge and returns the data URL', async () => {
    const sizes = mockDecode(4000, 3000, 1000);
    const url = await downscaleImage(new File(['x'], 'p.jpg', { type: 'image/jpeg' }));
    expect(url.length).toBe(1000);
    expect(sizes[0]).toEqual({ w: 1280, h: 960 });
  });
  it('never upscales a small image', async () => {
    const sizes = mockDecode(640, 480, 1000);
    await downscaleImage(new File(['x'], 'p.jpg'));
    expect(sizes[0]).toEqual({ w: 640, h: 480 });
  });
  it('refuses an oversized input file and an encode that stays over budget', async () => {
    mockDecode(100, 100, MAX_RESULT_CHARS + 1);
    const big = new File([new Uint8Array(1)], 'big.jpg');
    Object.defineProperty(big, 'size', { value: MAX_INPUT_BYTES + 1 });
    await expect(downscaleImage(big)).rejects.toThrow(NS_IMG_TOO_BIG);
    // Both rungs of the quality ladder over budget → the bilingual size error.
    await expect(downscaleImage(new File(['x'], 'p.jpg'))).rejects.toThrow(NS_IMG_TOO_BIG);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.6);
  });
});

describe('picture editor control', () => {
  afterEach(cleanup);
  it('stores a pasted URL and a caption; shows the preview once src is set', () => {
    const onPatch = vi.fn();
    const { rerender } = render(<SectionEditor section={pictureSection('')} onPatch={onPatch} />);
    expect(screen.getByText(NS_IMG_PICK)).toBeInTheDocument();
    expect(screen.queryByTestId('ns-picture-preview')).toBeNull();
    fireEvent.change(screen.getByLabelText(NS_IMG_URL), { target: { value: 'https://x.test/map.png' } });
    expect(onPatch).toHaveBeenCalledWith({ picture: { src: 'https://x.test/map.png', caption: undefined } });
    rerender(<SectionEditor section={pictureSection('https://x.test/map.png')} onPatch={onPatch} />);
    expect(screen.getByTestId('ns-picture-preview')).toHaveAttribute('src', 'https://x.test/map.png');
    fireEvent.change(screen.getByLabelText(NS_IMG_CAPTION), { target: { value: '约旦河 Jordan' } });
    expect(onPatch).toHaveBeenLastCalledWith({ picture: { src: 'https://x.test/map.png', caption: '约旦河 Jordan' } });
  });
  it('a failed downscale surfaces the bilingual error, not a crash', async () => {
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) { queueMicrotask(() => this.onerror?.()); }
    });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    render(<SectionEditor section={pictureSection('')} onPatch={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(NS_IMG_PICK), { target: { files: [new File(['x'], 'p.jpg')] } });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
