import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  dataUrlToFile,
  canShareFiles,
  isIOSSafari,
  sharePhoto,
  downloadPhoto,
  savePhotoToDevice,
} from '../photoSaveUtils';

const TINY_JPEG = 'data:image/jpeg;base64,AQID';

describe('photoSaveUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dataUrlToFile', () => {
    it('should convert a data URL to a File with correct name and type', () => {
      const file = dataUrlToFile(TINY_JPEG, 'photo.jpg');
      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('photo.jpg');
      expect(file.type).toBe('image/jpeg');
      expect(file.size).toBeGreaterThan(0);
    });

    it('should convert a PNG data URL', () => {
      const pngUrl = 'data:image/png;base64,BAUG';
      const file = dataUrlToFile(pngUrl, 'test.png');
      expect(file.type).toBe('image/png');
      expect(file.name).toBe('test.png');
    });

    it('should throw on invalid data URL', () => {
      expect(() => dataUrlToFile('not-a-data-url', 'bad.jpg')).toThrow('Invalid data URL');
    });
  });

  describe('canShareFiles', () => {
    it('should return false when navigator.share is not available', () => {
      expect(canShareFiles()).toBe(false);
    });

    it('should return true when both share and canShare exist', () => {
      Object.defineProperty(navigator, 'share', {
        value: vi.fn(), writable: true, configurable: true,
      });
      Object.defineProperty(navigator, 'canShare', {
        value: vi.fn(), writable: true, configurable: true,
      });
      expect(canShareFiles()).toBe(true);
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    });
  });

  describe('isIOSSafari', () => {
    const originalUserAgent = navigator.userAgent;
    afterEach(() => {
      Object.defineProperty(navigator, 'userAgent', {
        value: originalUserAgent, writable: true, configurable: true,
      });
    });

    it('should return true for iPhone user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        writable: true, configurable: true,
      });
      expect(isIOSSafari()).toBe(true);
    });

    it('should return true for iPad user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)',
        writable: true, configurable: true,
      });
      expect(isIOSSafari()).toBe(true);
    });

    it('should return false for Android user agent', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)',
        writable: true, configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0, writable: true, configurable: true,
      });
      expect(isIOSSafari()).toBe(false);
    });
  });

  describe('sharePhoto', () => {
    it('should return error when Web Share API is not available', async () => {
      const result = await sharePhoto(TINY_JPEG);
      expect(result.success).toBe(false);
      expect(result.method).toBe('none');
      expect(result.error).toContain('not available');
    });

    it('should share successfully when API is available', async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      const mockCanShare = vi.fn().mockReturnValue(true);
      Object.defineProperty(navigator, 'share', {
        value: mockShare, writable: true, configurable: true,
      });
      Object.defineProperty(navigator, 'canShare', {
        value: mockCanShare, writable: true, configurable: true,
      });
      const result = await sharePhoto(TINY_JPEG, 'test.jpg');
      expect(result.success).toBe(true);
      expect(result.method).toBe('share');
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    });

    it('should handle user cancellation gracefully', async () => {
      const abortError = new DOMException('Share cancelled', 'AbortError');
      Object.defineProperty(navigator, 'share', {
        value: vi.fn().mockRejectedValue(abortError), writable: true, configurable: true,
      });
      Object.defineProperty(navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true), writable: true, configurable: true,
      });
      const result = await sharePhoto(TINY_JPEG);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Share cancelled');
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    });

    it('should handle canShare returning false', async () => {
      Object.defineProperty(navigator, 'share', {
        value: vi.fn(), writable: true, configurable: true,
      });
      Object.defineProperty(navigator, 'canShare', {
        value: vi.fn().mockReturnValue(false), writable: true, configurable: true,
      });
      const result = await sharePhoto(TINY_JPEG);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot share files');
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    });
  });

  describe('downloadPhoto', () => {
    it('should create and click a download link', () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node as any);
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node as any);
      const result = downloadPhoto(TINY_JPEG, 'test.jpg');
      expect(result.success).toBe(true);
      expect(result.method).toBe('download');
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('should use default filename when none provided', () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node as any);
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node as any);
      const result = downloadPhoto(TINY_JPEG);
      expect(result.success).toBe(true);
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('savePhotoToDevice', () => {
    it('should fall back to download when share API is not available', async () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node as any);
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node as any);
      const result = await savePhotoToDevice(TINY_JPEG, 'fallback.jpg');
      expect(result.success).toBe(true);
      expect(result.method).toBe('download');
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });
});
