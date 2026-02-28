import { MediaAttachment } from '../types';

/**
 * Strips the `data:<mime>;base64,` prefix from a data URL, returning raw base64.
 * If the string contains no comma it is assumed to already be raw base64.
 */
export function extractBase64Data(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(',');
  return commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

/**
 * Creates a MediaAttachment from raw image data.
 * Accepts either a data-URL (`data:image/png;base64,...`) or plain base64.
 */
export function createMediaAttachment(
  imageData: string,
  mimeType: string
): MediaAttachment {
  const base64Data = extractBase64Data(imageData);
  // Each base64 character encodes 6 bits → 3 bytes per 4 chars
  const sizeInBytes = Math.ceil((base64Data.length * 3) / 4);

  return {
    id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    type: 'image',
    data: base64Data,
    mimeType,
    size: sizeInBytes,
    timestamp: Date.now(),
  };
}
