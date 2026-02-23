/**
 * pencilKitPlugin.ts
 *
 * TypeScript interface and registration for the native PencilKit Capacitor plugin.
 * Used only on native iOS — web/desktop users continue using the HTML canvas.
 *
 * The native plugin provides Apple PencilKit drawing with:
 * - True palm rejection (drawingPolicy = .pencilOnly)
 * - Full Apple Pencil pressure/tilt support
 * - No stroke disappearance at fast writing speeds
 * - Native undo manager integration
 */

import { registerPlugin } from '@capacitor/core';

export interface ShowOptions {
  /** X position of the canvas relative to the web view (CSS pixels) */
  x: number;
  /** Y position of the canvas relative to the web view (CSS pixels) */
  y: number;
  /** Width of the canvas (CSS pixels) */
  width: number;
  /** Height of the canvas (CSS pixels) */
  height: number;
  /** Previously saved drawing data (base64-encoded PKDrawing) */
  savedData?: string;
}

export interface SetToolOptions {
  /** Tool type: pen, marker, highlighter, or eraser */
  tool: 'pen' | 'marker' | 'highlighter' | 'eraser';
  /** Color as hex string (e.g. '#000000') */
  color: string;
  /** Stroke size in points */
  size: number;
}

export interface HideResult {
  /** Base64-encoded PKDrawing data */
  data: string;
}

export interface DrawingChangedEvent {
  /** Base64-encoded PKDrawing data of the current drawing */
  drawing: string;
}

export interface PencilKitPlugin {
  /**
   * Show the native PencilKit canvas overlaid on the web view.
   * The canvas is transparent and positioned over the specified area.
   */
  show(options: ShowOptions): Promise<void>;

  /**
   * Hide the native PencilKit canvas and return the current drawing data.
   * Returns base64-encoded PKDrawing data for persistent storage.
   */
  hide(): Promise<HideResult>;

  /**
   * Clear all strokes from the canvas.
   */
  clear(): Promise<void>;

  /**
   * Undo the last stroke using the native undo manager.
   */
  undo(): Promise<void>;

  /**
   * Set the current drawing tool, color, and size.
   */
  setTool(options: SetToolOptions): Promise<void>;

  /**
   * Load a previously saved drawing from base64 data.
   */
  loadDrawing(options: { data: string }): Promise<void>;

  /**
   * Listen for drawing changes. Fired after each stroke completes.
   * The event data contains the full drawing as base64-encoded PKDrawing.
   */
  addListener(
    eventName: 'drawingChanged',
    listenerFunc: (data: DrawingChangedEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

/**
 * The PencilKit plugin instance.
 * On native iOS, this bridges to the Swift PencilKitPlugin.
 * On web/desktop, calls will throw (check Capacitor.isNativePlatform() first).
 */
const PencilKit = registerPlugin<PencilKitPlugin>('PencilKitPlugin');

export default PencilKit;
