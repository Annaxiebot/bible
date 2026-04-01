/**
 * SupabaseMediaService - Cloud media storage via Supabase Storage
 *
 * Uploads photos and media attachments to Supabase Storage (1GB free tier),
 * returning public URLs instead of storing base64 data in the database.
 *
 * =========================================================================
 * SUPABASE BUCKET SETUP (run once via Supabase Dashboard SQL Editor):
 * =========================================================================
 *
 *   -- Create the media bucket (1GB free tier)
 *   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
 *   VALUES (
 *     'media',
 *     'media',
 *     true,
 *     10485760,  -- 10MB per file
 *     ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif',
 *           'audio/mpeg', 'audio/wav', 'video/mp4']
 *   );
 *
 *   -- Allow authenticated users to upload to their own folder
 *   CREATE POLICY "Users can upload media"
 *     ON storage.objects FOR INSERT
 *     TO authenticated
 *     WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
 *
 *   -- Allow authenticated users to read their own media
 *   CREATE POLICY "Users can read own media"
 *     ON storage.objects FOR SELECT
 *     TO authenticated
 *     USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
 *
 *   -- Allow public read access (for sharing / public URLs)
 *   CREATE POLICY "Public read access"
 *     ON storage.objects FOR SELECT
 *     TO public
 *     USING (bucket_id = 'media');
 *
 *   -- Allow users to delete their own media
 *   CREATE POLICY "Users can delete own media"
 *     ON storage.objects FOR DELETE
 *     TO authenticated
 *     USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
 *
 * =========================================================================
 */

import { supabase, authManager, canSync } from './supabase';

export interface CloudMediaResult {
  url: string;
  path: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface UploadOptions {
  folder?: string;
  filename?: string;
  uniqueName?: boolean;
}

const BUCKET_NAME = 'media';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export class SupabaseMediaService {
  async upload(
    file: File | Blob | string,
    mimeType: string,
    options: UploadOptions = {}
  ): Promise<CloudMediaResult> {
    if (!canSync() || !supabase) {
      throw new Error('Cloud storage not available: not authenticated or offline');
    }

    const userId = authManager.getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    let blob: Blob;
    let detectedMimeType = mimeType;
    let originalFilename: string | undefined;

    if (typeof file === 'string') {
      blob = this.base64ToBlob(file);
      detectedMimeType = this.extractMimeType(file) || mimeType;
    } else if (file instanceof File) {
      blob = file;
      originalFilename = file.name;
      detectedMimeType = file.type || mimeType;
    } else {
      blob = file;
      detectedMimeType = file.type || mimeType;
    }

    if (blob.size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${(blob.size / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`
      );
    }

    const folder = options.folder || 'general';
    const ext = this.mimeToExtension(detectedMimeType);
    const uniqueSuffix = options.uniqueName !== false
      ? `_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      : '';
    const filename = options.filename ||
      `${originalFilename?.replace(/\.[^.]+$/, '') || 'media'}${uniqueSuffix}.${ext}`;
    const storagePath = `${userId}/${folder}/${filename}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, blob, {
        contentType: detectedMimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    return {
      url: urlData.publicUrl,
      path: data.path,
      filename,
      mimeType: detectedMimeType,
      size: blob.size,
    };
  }

  async delete(storagePath: string): Promise<void> {
    if (!canSync() || !supabase) {
      throw new Error('Cloud storage not available');
    }

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  async getSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error) {
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }

  async listFiles(folder?: string): Promise<{ name: string; size: number; createdAt: string }[]> {
    if (!canSync() || !supabase) {
      return [];
    }

    const userId = authManager.getUserId();
    if (!userId) return [];

    const path = folder ? `${userId}/${folder}` : userId;
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(path, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) return [];

    return (data || [])
      .filter(item => item.name !== '.emptyFolderPlaceholder')
      .map(item => ({
        name: item.name,
        size: item.metadata?.size || 0,
        createdAt: item.created_at || '',
      }));
  }

  async getUsage(): Promise<{ totalFiles: number; totalSize: number }> {
    const files = await this.listFiles();
    return {
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
    };
  }

  isAvailable(): boolean {
    return canSync();
  }

  private base64ToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(',');
    if (parts.length !== 2) {
      throw new Error('Invalid data URL format');
    }

    const headerMatch = parts[0].match(/:(.*?);/);
    const mime = headerMatch ? headerMatch[1] : 'application/octet-stream';
    const bstr = atob(parts[1]);
    const u8arr = new Uint8Array(bstr.length);

    for (let i = 0; i < bstr.length; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }

    return new Blob([u8arr], { type: mime });
  }

  private extractMimeType(dataUrl: string): string | null {
    const match = dataUrl.match(/^data:([^;]+);/);
    return match ? match[1] : null;
  }

  private mimeToExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'video/mp4': 'mp4',
    };
    return map[mimeType] || 'bin';
  }
}

export const supabaseMediaService = new SupabaseMediaService();
