/**
 * imageBlobStorage.ts
 *
 * Stores images as binary Blobs in IndexedDB and serves them via object URLs.
 * Replaces inline base64 storage which is ~33% larger and slow to serialize.
 *
 * API:
 *   storeImageFromBase64(base64, mimeType)  -> id
 *   storeImageFromBlob(blob)                -> id
 *   getImageUrl(id)                         -> object URL (cached + refcounted)
 *   revokeImageUrl(id)                      -> decrement refcount, free when 0
 *   deleteImage(id)                         -> remove from IndexedDB
 *
 * Legacy base64 data still works via useImageSrc hook's fallback path.
 */

import { idbService, ImageBlobRecord } from './idbService';

const STORE = 'imageBlobs' as const;

/** Cache of active object URLs with refcount so repeated useImageSrc
 * calls for the same id share a single blob URL and only revoke once. */
const urlCache = new Map<string, { url: string; refCount: number }>();

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

/** Convert a base64 string (with or without data: prefix) to a Blob. */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  // Strip any data URL prefix
  const commaIdx = base64.indexOf(',');
  const raw = commaIdx >= 0 ? base64.slice(commaIdx + 1) : base64;
  const binary = atob(raw);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function storeImageFromBlob(blob: Blob): Promise<string> {
  const id = generateId();
  const record: ImageBlobRecord = {
    id,
    blob,
    mimeType: blob.type || 'application/octet-stream',
    createdAt: Date.now(),
  };
  await idbService.put(STORE, record);
  return id;
}

export async function storeImageFromBase64(base64: string, mimeType: string): Promise<string> {
  const blob = base64ToBlob(base64, mimeType);
  return storeImageFromBlob(blob);
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const rec = await idbService.get(STORE, id);
  return rec ? rec.blob : null;
}

/** Get (or create) an object URL for the given image id. Refcounted. */
export async function getImageUrl(id: string): Promise<string | null> {
  const existing = urlCache.get(id);
  if (existing) {
    existing.refCount += 1;
    return existing.url;
  }

  const blob = await getImageBlob(id);
  if (!blob) return null;

  // Check again in case of race (another caller created it while we awaited)
  const raced = urlCache.get(id);
  if (raced) {
    raced.refCount += 1;
    return raced.url;
  }

  const url = URL.createObjectURL(blob);
  urlCache.set(id, { url, refCount: 1 });
  return url;
}

/** Decrement refcount; revoke and drop cache entry when reaches 0. */
export function revokeImageUrl(id: string): void {
  const entry = urlCache.get(id);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    try {
      URL.revokeObjectURL(entry.url);
    } catch (e) {
      console.warn('[imageBlobStorage] revoke failed', e);
    }
    urlCache.delete(id);
  }
}

export async function deleteImage(id: string): Promise<void> {
  // Revoke any active URL first
  const entry = urlCache.get(id);
  if (entry) {
    try { URL.revokeObjectURL(entry.url); } catch {}
    urlCache.delete(id);
  }
  await idbService.delete(STORE, id);
}

/** For tests: reset in-memory URL cache. Does NOT clear IndexedDB. */
export function __resetUrlCacheForTests(): void {
  for (const entry of urlCache.values()) {
    try { URL.revokeObjectURL(entry.url); } catch {}
  }
  urlCache.clear();
}
