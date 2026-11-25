/**
 * Simple Canvas Renderer — Working with base64 image data
 *
 * Simplified rendering service for the new SimpleDrawingCanvas system.
 * Since canvas data is already in base64 format, this mainly handles
 * image processing for print/export.
 */

/**
 * Convert base64 image data to a specific size for printing
 */
export function resizeBase64Image(
  base64Data: string,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!base64Data || !base64Data.startsWith('data:image')) {
      resolve('');
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // Fill with white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // Draw the image, scaled to fit
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      resolve(canvas.toDataURL());
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64Data;
  });
}

/**
 * Create a thumbnail from base64 image data
 */
export function createThumbnail(base64Data: string, size: number = 200): Promise<string> {
  return resizeBase64Image(base64Data, size, size);
}

/**
 * Check if base64 data represents a non-empty drawing
 */
export function isNonEmptyDrawing(base64Data: string): boolean {
  if (!base64Data || !base64Data.startsWith('data:image')) {
    return false;
  }
  
  // Simple heuristic: check if the data URL is longer than a minimal empty canvas
  // An empty canvas typically produces a data URL of ~100-200 characters
  return base64Data.length > 500;
}

/**
 * Legacy compatibility: Convert old SerializedPath data to empty string
 * (since we can't convert paths back to images)
 */
export function migratePathDataToBase64(data: string): string {
  try {
    // If it's already a base64 image, return as-is
    if (data.startsWith('data:image')) {
      return data;
    }
    
    // Try to parse as JSON (old path format)
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      // Old SerializedPath format - we can't convert this back to an image
      // Return empty string to indicate no drawing
      return '';
    }
    
    // Unknown format
    return '';
  } catch {
    // Not JSON, might be old format or empty
    return '';
  }
}