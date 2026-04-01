import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseMediaService } from '../supabaseMediaService';

const mockUpload = vi.fn();
const mockRemove = vi.fn();
const mockGetPublicUrl = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockList = vi.fn();

const mockStorage = {
  from: vi.fn((_bucket?: string) => ({
    upload: mockUpload,
    remove: mockRemove,
    getPublicUrl: mockGetPublicUrl,
    createSignedUrl: mockCreateSignedUrl,
    list: mockList,
  })),
};

const mockGetUserId = vi.fn();
const mockCanSync = vi.fn();

vi.mock('../supabase', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => mockStorage.from(bucket),
    },
  },
  authManager: {
    getUserId: () => mockGetUserId(),
  },
  canSync: () => mockCanSync(),
}));

describe('SupabaseMediaService', () => {
  let service: SupabaseMediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SupabaseMediaService();
    mockCanSync.mockReturnValue(true);
    mockGetUserId.mockReturnValue('user-123');
  });

  describe('upload', () => {
    it('should upload a base64 data URL and return public URL', async () => {
      mockUpload.mockResolvedValue({ data: { path: 'user-123/chat/media_abc.jpg' }, error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://storage.supabase.co/media/user-123/chat/media_abc.jpg' },
      });

      const result = await service.upload('data:image/jpeg;base64,AQID', 'image/jpeg', { folder: 'chat' });
      expect(result.url).toBe('https://storage.supabase.co/media/user-123/chat/media_abc.jpg');
      expect(result.path).toBe('user-123/chat/media_abc.jpg');
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.size).toBeGreaterThan(0);
      expect(mockStorage.from).toHaveBeenCalledWith('media');
    });

    it('should upload a File object', async () => {
      const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
      mockUpload.mockResolvedValue({ data: { path: 'user-123/general/photo_123.png' }, error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://storage.supabase.co/media/user-123/general/photo_123.png' },
      });
      const result = await service.upload(file, 'image/png');
      expect(result.mimeType).toBe('image/png');
      expect(result.size).toBe(3);
    });

    it('should upload a Blob', async () => {
      const blob = new Blob([new Uint8Array([10, 20, 30])], { type: 'image/webp' });
      mockUpload.mockResolvedValue({ data: { path: 'user-123/notes/media_abc.webp' }, error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://storage.supabase.co/media/user-123/notes/media_abc.webp' },
      });
      const result = await service.upload(blob, 'image/webp', { folder: 'notes' });
      expect(result.mimeType).toBe('image/webp');
      expect(result.size).toBe(3);
    });

    it('should throw when not authenticated', async () => {
      mockCanSync.mockReturnValue(false);
      await expect(
        service.upload('data:image/png;base64,AQID', 'image/png')
      ).rejects.toThrow('Cloud storage not available');
    });

    it('should throw when user ID is missing', async () => {
      mockGetUserId.mockReturnValue(null);
      await expect(
        service.upload('data:image/png;base64,AQID', 'image/png')
      ).rejects.toThrow('User not authenticated');
    });

    it('should throw when file exceeds size limit', async () => {
      const largeBlob = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/jpeg' });
      await expect(service.upload(largeBlob, 'image/jpeg')).rejects.toThrow(/File too large/);
    });

    it('should throw when upload fails', async () => {
      mockUpload.mockResolvedValue({ data: null, error: { message: 'Bucket not found' } });
      await expect(
        service.upload('data:image/png;base64,AQID', 'image/png')
      ).rejects.toThrow('Upload failed: Bucket not found');
    });

    it('should use custom filename when provided', async () => {
      mockUpload.mockResolvedValue({ data: { path: 'user-123/chat/custom-name.jpg' }, error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://storage.supabase.co/media/user-123/chat/custom-name.jpg' },
      });
      const result = await service.upload(
        'data:image/jpeg;base64,AQID', 'image/jpeg',
        { folder: 'chat', filename: 'custom-name.jpg', uniqueName: false }
      );
      expect(result.filename).toBe('custom-name.jpg');
    });
  });

  describe('delete', () => {
    it('should delete a file by path', async () => {
      mockRemove.mockResolvedValue({ error: null });
      await service.delete('user-123/chat/photo.jpg');
      expect(mockRemove).toHaveBeenCalledWith(['user-123/chat/photo.jpg']);
    });

    it('should throw when delete fails', async () => {
      mockRemove.mockResolvedValue({ error: { message: 'Not found' } });
      await expect(service.delete('user-123/chat/missing.jpg')).rejects.toThrow('Delete failed: Not found');
    });

    it('should throw when not authenticated', async () => {
      mockCanSync.mockReturnValue(false);
      await expect(service.delete('user-123/chat/photo.jpg')).rejects.toThrow('Cloud storage not available');
    });
  });

  describe('getSignedUrl', () => {
    it('should return a signed URL', async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://storage.supabase.co/media/signed/abc123' }, error: null,
      });
      const url = await service.getSignedUrl('user-123/chat/photo.jpg');
      expect(url).toBe('https://storage.supabase.co/media/signed/abc123');
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('user-123/chat/photo.jpg', 3600);
    });

    it('should accept custom expiry', async () => {
      mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed-url' }, error: null });
      await service.getSignedUrl('path', 7200);
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('path', 7200);
    });

    it('should throw on error', async () => {
      mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'Expired' } });
      await expect(service.getSignedUrl('path')).rejects.toThrow('Failed to create signed URL: Expired');
    });
  });

  describe('listFiles', () => {
    it('should list files in user folder', async () => {
      mockList.mockResolvedValue({
        data: [
          { name: 'photo1.jpg', metadata: { size: 1024 }, created_at: '2026-01-01' },
          { name: 'photo2.png', metadata: { size: 2048 }, created_at: '2026-01-02' },
        ],
        error: null,
      });
      const files = await service.listFiles('chat');
      expect(files).toHaveLength(2);
      expect(files[0].name).toBe('photo1.jpg');
      expect(mockList).toHaveBeenCalledWith('user-123/chat', expect.any(Object));
    });

    it('should return empty array when not authenticated', async () => {
      mockCanSync.mockReturnValue(false);
      expect(await service.listFiles()).toEqual([]);
    });

    it('should filter out placeholder files', async () => {
      mockList.mockResolvedValue({
        data: [
          { name: '.emptyFolderPlaceholder', metadata: {}, created_at: '' },
          { name: 'photo.jpg', metadata: { size: 500 }, created_at: '2026-01-01' },
        ],
        error: null,
      });
      const files = await service.listFiles();
      expect(files).toHaveLength(1);
    });
  });

  describe('getUsage', () => {
    it('should sum file sizes', async () => {
      mockList.mockResolvedValue({
        data: [
          { name: 'a.jpg', metadata: { size: 100 }, created_at: '' },
          { name: 'b.png', metadata: { size: 200 }, created_at: '' },
        ],
        error: null,
      });
      const usage = await service.getUsage();
      expect(usage.totalFiles).toBe(2);
      expect(usage.totalSize).toBe(300);
    });
  });

  describe('isAvailable', () => {
    it('should return true when canSync is true', () => {
      mockCanSync.mockReturnValue(true);
      expect(service.isAvailable()).toBe(true);
    });

    it('should return false when canSync is false', () => {
      mockCanSync.mockReturnValue(false);
      expect(service.isAvailable()).toBe(false);
    });
  });
});
