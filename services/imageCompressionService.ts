/**
 * Image compression service.
 *
 * Provides utilities for compressing images before sending them to the AI.
 * Handles canvas-based resizing, quality iteration, and base64 extraction.
 */

import { IMAGE } from '../constants/appConfig';

export interface CompressedImage {
  base64: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
}

/**
 * Extracts base64 string and MIME type from a data URL.
 *
 * @param dataUrl - A data URL string in the form `data:<mimeType>;base64,<data>`
 * @returns Object with `base64` (the raw base64 payload) and `mimeType`.
 */
export function dataUrlToBase64(dataUrl: string): { base64: string; mimeType: string } {
  const [header, base64] = dataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  return { base64: base64 ?? '', mimeType };
}

/**
 * Compresses an image supplied as a data URL using a canvas draw + JPEG
 * quality iteration loop.  Scales the image down first if either dimension
 * exceeds IMAGE.MAX_DIMENSION, then reduces quality until the encoded size
 * is within IMAGE.MAX_BYTES.
 *
 * Important: the caller is responsible for revoking any object URLs it
 * created before calling this function.
 *
 * @param dataUrl - Source image as a data URL (any browser-supported format).
 * @returns Compressed image with base64 payload and metadata.
 */
function compressDataUrl(dataUrl: string): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const originalSize = Math.round(dataUrl.length * 0.75);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let { width, height } = img;

        if (width > IMAGE.MAX_DIMENSION || height > IMAGE.MAX_DIMENSION) {
          const scale = IMAGE.MAX_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context failed'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = IMAGE.INITIAL_QUALITY;
        let result = canvas.toDataURL('image/jpeg', quality);
        while (result.length * 0.75 > IMAGE.MAX_BYTES && quality > IMAGE.MIN_QUALITY) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }

        // Release canvas memory (important for iOS Safari)
        canvas.width = 0;
        canvas.height = 0;

        const compressedSize = Math.round(result.length * 0.75);
        const { base64 } = dataUrlToBase64(result);
        resolve({ base64, mimeType: 'image/jpeg', originalSize, compressedSize });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

/**
 * Compresses an image from a File or Blob.
 *
 * Uses an object URL internally for better iOS compatibility, then revokes
 * it after loading.
 *
 * @param file - Source File or Blob.
 * @returns Compressed image with base64 payload and metadata.
 */
export async function compressImage(file: File | Blob): Promise<CompressedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await compressDataUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Compresses an image from an existing data URL or object URL string.
 *
 * @param url - Source URL (data URL or object URL).
 * @returns Compressed image with base64 payload and metadata.
 */
export async function compressImageFromUrl(url: string): Promise<CompressedImage> {
  return compressDataUrl(url);
}
