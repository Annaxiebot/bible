/**
 * photoSaveUtils - Save captured photos to device photo library
 *
 * Uses browser-native capabilities:
 * - navigator.share() for iOS share sheet (save to Photos)
 * - <a download> for desktop fallback
 * - Canvas toBlob() to convert captured images
 */

export interface SavePhotoResult {
  success: boolean;
  method: 'share' | 'download' | 'none';
  error?: string;
}

/**
 * Convert a data URL to a File object suitable for sharing.
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const parts = dataUrl.split(',');
  if (parts.length !== 2) {
    throw new Error('Invalid data URL');
  }

  const headerMatch = parts[0].match(/:(.*?);/);
  const mime = headerMatch ? headerMatch[1] : 'image/jpeg';
  const bstr = atob(parts[1]);
  const u8arr = new Uint8Array(bstr.length);

  for (let i = 0; i < bstr.length; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }

  return new File([u8arr], filename, { type: mime });
}

/**
 * Convert a data URL to a Blob using Canvas toBlob().
 */
export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob returned null'));
          }
        },
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/**
 * Check if the Web Share API is available and supports file sharing.
 */
export function canShareFiles(): boolean {
  return typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';
}

/**
 * Check if we're running on iOS Safari (where share sheet can save to Photos).
 */
export function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.maxTouchPoints > 0 && /Macintosh/.test(ua));
}

/**
 * Save a photo using the Web Share API (iOS share sheet).
 */
export async function sharePhoto(dataUrl: string, filename?: string): Promise<SavePhotoResult> {
  const name = filename || `bible-photo-${Date.now()}.jpg`;

  try {
    const file = dataUrlToFile(dataUrl, name);

    if (!canShareFiles()) {
      return { success: false, method: 'none', error: 'Web Share API not available' };
    }

    const shareData: ShareData = {
      files: [file],
      title: 'Save Photo',
    };

    if (!navigator.canShare(shareData)) {
      return { success: false, method: 'none', error: 'Cannot share files on this device' };
    }

    await navigator.share(shareData);
    return { success: true, method: 'share' };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { success: false, method: 'share', error: 'Share cancelled' };
    }
    return { success: false, method: 'share', error: err?.message || 'Share failed' };
  }
}

/**
 * Save a photo via download link (<a download> fallback for desktop).
 */
export function downloadPhoto(dataUrl: string, filename?: string): SavePhotoResult {
  const name = filename || `bible-photo-${Date.now()}.jpg`;

  try {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
    }, 100);

    return { success: true, method: 'download' };
  } catch (err: any) {
    return { success: false, method: 'download', error: err?.message || 'Download failed' };
  }
}

/**
 * Save a captured photo to the device.
 * Automatically selects the best method:
 * - iOS: Web Share API (share sheet with "Save Image" option)
 * - Desktop: Download link
 */
export async function savePhotoToDevice(
  dataUrl: string,
  filename?: string
): Promise<SavePhotoResult> {
  if (isIOSSafari() && canShareFiles()) {
    const shareResult = await sharePhoto(dataUrl, filename);
    if (shareResult.success || shareResult.error === 'Share cancelled') {
      return shareResult;
    }
  }

  if (canShareFiles()) {
    const shareResult = await sharePhoto(dataUrl, filename);
    if (shareResult.success) {
      return shareResult;
    }
  }

  return downloadPhoto(dataUrl, filename);
}
