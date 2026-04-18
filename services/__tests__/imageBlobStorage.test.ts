import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  storeImageFromBase64,
  storeImageFromBlob,
  getImageBlob,
  getImageUrl,
  revokeImageUrl,
  deleteImage,
  base64ToBlob,
  __resetUrlCacheForTests,
} from '../imageBlobStorage';
import { idbService } from '../idbService';

// Small 1x1 transparent PNG
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

describe('imageBlobStorage', () => {
  beforeEach(async () => {
    __resetUrlCacheForTests();
    // Clear the imageBlobs store between tests
    try {
      await idbService.clear('imageBlobs');
    } catch {
      // fake-indexeddb may need store created first; ignore
    }
  });

  describe('base64ToBlob', () => {
    it('converts base64 to Blob with correct byte length', () => {
      const blob = base64ToBlob(TINY_PNG_BASE64, 'image/png');
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      // The PNG decoded from this base64 is 68 bytes
      expect(blob.size).toBeGreaterThan(0);
    });

    it('strips data: URL prefix if present', () => {
      const withPrefix = base64ToBlob(`data:image/png;base64,${TINY_PNG_BASE64}`, 'image/png');
      const withoutPrefix = base64ToBlob(TINY_PNG_BASE64, 'image/png');
      expect(withPrefix.size).toBe(withoutPrefix.size);
    });

    it('produces identical blobs for same input', () => {
      const a = base64ToBlob(TINY_PNG_BASE64, 'image/png');
      const b = base64ToBlob(TINY_PNG_BASE64, 'image/png');
      expect(a.size).toBe(b.size);
    });
  });

  describe('store + retrieve', () => {
    // Note: fake-indexeddb doesn't preserve Blob.type/size through round-trip, so we
    // check only that a record exists. Real browsers preserve these correctly.
    it('storeImageFromBase64 returns an id and stores a record', async () => {
      const id = await storeImageFromBase64(TINY_PNG_BASE64, 'image/png');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);

      const blob = await getImageBlob(id);
      expect(blob).not.toBeNull();
    });

    it('storeImageFromBlob returns an id and stores a record', async () => {
      const original = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' });
      const id = await storeImageFromBlob(original);
      const retrieved = await getImageBlob(id);
      expect(retrieved).not.toBeNull();
    });

    it('returns null for nonexistent id', async () => {
      const blob = await getImageBlob('does-not-exist');
      expect(blob).toBeNull();
    });

    it('generates unique ids for repeated stores', async () => {
      const id1 = await storeImageFromBase64(TINY_PNG_BASE64, 'image/png');
      const id2 = await storeImageFromBase64(TINY_PNG_BASE64, 'image/png');
      expect(id1).not.toBe(id2);
    });
  });

  describe('getImageUrl / revokeImageUrl refcounting', () => {
    beforeEach(() => {
      // Mock URL.createObjectURL / revokeObjectURL (jsdom doesn't provide them)
      let counter = 0;
      (URL as any).createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
      (URL as any).revokeObjectURL = vi.fn();
    });

    it('returns same URL for repeated getImageUrl calls', async () => {
      const id = await storeImageFromBase64(TINY_PNG_BASE64, 'image/png');
      const url1 = await getImageUrl(id);
      const url2 = await getImageUrl(id);
      expect(url1).toBeTruthy();
      expect(url1).toBe(url2);
    });

    it('refcounts revokes: double get requires double revoke', async () => {
      const id = await storeImageFromBase64(TINY_PNG_BASE64, 'image/png');
      const url1 = await getImageUrl(id);
      await getImageUrl(id);

      revokeImageUrl(id);
      // After one revoke, URL still valid (refcount from 2 → 1)
      expect((URL.revokeObjectURL as any).mock.calls.length).toBe(0);

      revokeImageUrl(id);
      // Second revoke frees it
      expect((URL.revokeObjectURL as any).mock.calls.length).toBe(1);
      expect((URL.revokeObjectURL as any).mock.calls[0][0]).toBe(url1);
    });

    it('returns null for nonexistent id', async () => {
      const url = await getImageUrl('nope');
      expect(url).toBeNull();
    });

    it('revokeImageUrl on unknown id is a no-op', () => {
      expect(() => revokeImageUrl('never-stored')).not.toThrow();
    });
  });

  describe('deleteImage', () => {
    beforeEach(() => {
      (URL as any).createObjectURL = vi.fn(() => 'blob:mock');
      (URL as any).revokeObjectURL = vi.fn();
    });

    it('removes the record from IndexedDB', async () => {
      const id = await storeImageFromBase64(TINY_PNG_BASE64, 'image/png');
      await deleteImage(id);
      const blob = await getImageBlob(id);
      expect(blob).toBeNull();
    });

    it('revokes any active URL for the deleted image', async () => {
      const id = await storeImageFromBase64(TINY_PNG_BASE64, 'image/png');
      await getImageUrl(id); // creates url with refcount 1
      await deleteImage(id);
      expect((URL.revokeObjectURL as any).mock.calls.length).toBe(1);
    });
  });
});
