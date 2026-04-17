/**
 * useImageSrc.ts
 *
 * Resolves various image reference formats to a string suitable for <img src>.
 * Handles:
 *   - "blob-ref:<id>"         → fetch blob from IndexedDB, return object URL
 *   - { kind: 'blob', id }    → same
 *   - { kind: 'base64', ... } → return data URI
 *   - { data, mimeType } (legacy MediaAttachment) → treat as base64
 *   - data:... URIs           → pass through
 *   - http(s):// or blob://   → pass through
 *
 * Automatically revokes object URLs on unmount to prevent memory leaks.
 */

import { useEffect, useState } from 'react';
import { getImageUrl, revokeImageUrl } from '../services/imageBlobStorage';

export const BLOB_REF_PREFIX = 'blob-ref:';

export type ImageInput =
  | string
  | { kind: 'blob'; id: string; mimeType?: string }
  | { kind: 'base64'; data: string; mimeType: string }
  | { data: string; mimeType: string } // legacy MediaAttachment shape
  | null
  | undefined;

/**
 * Extract a blob id from either a "blob-ref:" string or a { kind: 'blob', id } object.
 * Returns null for any other shape.
 */
function getBlobId(input: ImageInput): string | null {
  if (!input) return null;
  if (typeof input === 'string') {
    if (input.startsWith(BLOB_REF_PREFIX)) {
      return input.slice(BLOB_REF_PREFIX.length);
    }
    return null;
  }
  if ('kind' in input && input.kind === 'blob') {
    return input.id;
  }
  return null;
}

/** Resolve non-blob inputs to a string src synchronously. */
function resolveSyncSrc(input: ImageInput): string | undefined {
  if (!input) return undefined;
  if (typeof input === 'string') {
    // blob-ref handled separately (async)
    if (input.startsWith(BLOB_REF_PREFIX)) return undefined;
    return input;
  }
  if ('kind' in input) {
    if (input.kind === 'base64') {
      return `data:${input.mimeType};base64,${input.data}`;
    }
    // kind === 'blob' handled separately (async)
    return undefined;
  }
  // Legacy { data, mimeType } shape from MediaAttachment
  if ('data' in input && 'mimeType' in input) {
    return `data:${input.mimeType};base64,${input.data}`;
  }
  return undefined;
}

/**
 * React hook that returns a usable src string for an image reference.
 * For blob refs, fetches the blob asynchronously and manages the object URL
 * lifecycle (create on mount/input-change, revoke on unmount/input-change).
 */
export function useImageSrc(input: ImageInput): string | undefined {
  const syncSrc = resolveSyncSrc(input);
  const blobId = getBlobId(input);

  const [blobSrc, setBlobSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!blobId || typeof window === 'undefined') {
      setBlobSrc(undefined);
      return;
    }

    let cancelled = false;
    getImageUrl(blobId).then((url) => {
      if (cancelled) {
        // If getImageUrl incremented refcount, balance it.
        if (url) revokeImageUrl(blobId);
        return;
      }
      setBlobSrc(url || undefined);
    }).catch((err) => {
      console.warn('[useImageSrc] Failed to load blob', blobId, err);
      if (!cancelled) setBlobSrc(undefined);
    });

    return () => {
      cancelled = true;
      revokeImageUrl(blobId);
    };
  }, [blobId]);

  return blobId ? blobSrc : syncSrc;
}
