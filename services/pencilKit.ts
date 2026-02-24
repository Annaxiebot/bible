import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * PencilKit Plugin Interface
 * Provides access to native iOS PencilKit for Apple Pencil drawing
 */
export interface PencilKitPlugin {
  /**
   * Open native PencilKit canvas for drawing
   * @param options - Configuration options
   * @param options.drawingData - Optional base64-encoded PKDrawing data to load
   * @returns Promise with drawing data or cancelled flag
   */
  openCanvas(options: { drawingData?: string }): Promise<{ 
    drawingData?: string; 
    cancelled?: boolean 
  }>;
}

const PencilKit = registerPlugin<PencilKitPlugin>('PencilKit');

/**
 * PencilKitService - High-level API for native Apple Pencil drawing
 * 
 * Usage:
 * ```typescript
 * if (PencilKitService.isAvailable()) {
 *   const drawingData = await PencilKitService.openCanvas();
 *   if (drawingData) {
 *     // Save the base64 PKDrawing data
 *   }
 * }
 * ```
 */
export class PencilKitService {
  /**
   * Check if PencilKit is available (iOS only)
   */
  static isAvailable(): boolean {
    return Capacitor.getPlatform() === 'ios';
  }
  
  /**
   * Get current platform
   */
  static getPlatform(): string {
    return Capacitor.getPlatform();
  }
  
  /**
   * Open native PencilKit canvas
   * @param existingDrawing - Optional base64-encoded PKDrawing data to edit
   * @returns Base64-encoded PKDrawing data or null if cancelled
   */
  static async openCanvas(existingDrawing?: string): Promise<string | null> {
    if (!this.isAvailable()) {
      console.warn('PencilKit is only available on iOS');
      return null;
    }
    
    try {
      const result = await PencilKit.openCanvas({ 
        drawingData: existingDrawing 
      });
      
      if (result.cancelled) {
        return null;
      }
      
      return result.drawingData || null;
    } catch (error) {
      console.error('PencilKit error:', error);
      return null;
    }
  }
}

export default PencilKitService;
