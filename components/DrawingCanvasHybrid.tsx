/**
 * DrawingCanvasHybrid.tsx
 * 
 * Platform-aware drawing component that uses:
 * - Native PencilKit on iOS (for Apple Pencil support)
 * - Web-based DrawingCanvas on other platforms
 */

import React, { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import DrawingCanvas, { DrawingCanvasHandle, SerializedPath } from './DrawingCanvas';
import { PencilKitService } from '../services/pencilKit';

interface DrawingCanvasHybridProps {
  initialData?: string;
  pkDrawingData?: string;
  onChange: (data: string, pkData?: string) => void;
  overlayMode?: boolean;
  isWritingMode?: boolean;
  canvasHeight?: number;
}

export interface DrawingCanvasHybridHandle {
  clear: () => void;
  getData: () => string;
  getPKData: () => string | undefined;
  undo: () => void;
  setTool: (tool: 'pen' | 'marker' | 'highlighter' | 'eraser') => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  redraw: () => void;
  loadPaths: (paths: SerializedPath[]) => void;
  openNativeCanvas?: () => Promise<void>;
}

const DrawingCanvasHybrid = forwardRef<DrawingCanvasHybridHandle, DrawingCanvasHybridProps>(
  ({ initialData, pkDrawingData, onChange, overlayMode = false, isWritingMode = true, canvasHeight }, ref) => {
    
    const [isIOS, setIsIOS] = useState(false);
    const [currentPKData, setCurrentPKData] = useState<string | undefined>(pkDrawingData);
    const webCanvasRef = useRef<DrawingCanvasHandle>(null);

    useEffect(() => {
      setIsIOS(PencilKitService.isAvailable());
    }, []);

    const openNativeCanvas = async () => {
      if (!isIOS) {
        console.warn('PencilKit is only available on iOS');
        return;
      }

      try {
        const result = await PencilKitService.openCanvas(currentPKData);
        if (result) {
          setCurrentPKData(result);
          onChange(webCanvasRef.current?.getData() || '', result);
        }
      } catch (error) {
        console.error('Failed to open native canvas:', error);
      }
    };

    useImperativeHandle(ref, () => ({
      clear: () => {
        webCanvasRef.current?.clear();
        setCurrentPKData(undefined);
        onChange('', undefined);
      },
      getData: () => {
        return webCanvasRef.current?.getData() || '';
      },
      getPKData: () => {
        return currentPKData;
      },
      undo: () => {
        webCanvasRef.current?.undo();
      },
      setTool: (tool) => {
        webCanvasRef.current?.setTool(tool);
      },
      setColor: (color) => {
        webCanvasRef.current?.setColor(color);
      },
      setSize: (size) => {
        webCanvasRef.current?.setSize(size);
      },
      redraw: () => {
        webCanvasRef.current?.redraw();
      },
      loadPaths: (paths) => {
        webCanvasRef.current?.loadPaths(paths);
      },
      openNativeCanvas: isIOS ? openNativeCanvas : undefined,
    }));

    // On iOS, show both a button to open native canvas and the web canvas as preview/fallback
    if (isIOS && isWritingMode) {
      return (
        <div className="relative w-full" style={{ height: canvasHeight ? `${canvasHeight}px` : '100%' }}>
          {/* Native PencilKit button */}
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={openNativeCanvas}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-lg flex items-center gap-2 transition-colors"
            >
              <span className="text-xl">✏️</span>
              <span className="font-medium">Draw with Apple Pencil</span>
            </button>
          </div>

          {/* Web canvas as preview/fallback */}
          <DrawingCanvas
            ref={webCanvasRef}
            initialData={initialData}
            onChange={(data) => onChange(data, currentPKData)}
            overlayMode={overlayMode}
            isWritingMode={isWritingMode}
            canvasHeight={canvasHeight}
          />

          {/* Show indicator if native drawing exists */}
          {currentPKData && (
            <div className="absolute bottom-2 left-2 z-10 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm flex items-center gap-1">
              <span>✓</span>
              <span>Native drawing saved</span>
            </div>
          )}
        </div>
      );
    }

    // On other platforms or in read mode, use web canvas only
    return (
      <DrawingCanvas
        ref={webCanvasRef}
        initialData={initialData}
        onChange={(data) => onChange(data, currentPKData)}
        overlayMode={overlayMode}
        isWritingMode={isWritingMode}
        canvasHeight={canvasHeight}
      />
    );
  }
);

DrawingCanvasHybrid.displayName = 'DrawingCanvasHybrid';
export default DrawingCanvasHybrid;
