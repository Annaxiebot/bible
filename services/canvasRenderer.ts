/**
 * Canvas Renderer — Offscreen rendering of SerializedPath[] to images
 *
 * Shared rendering logic used by:
 * - DrawingCanvas.tsx (live drawing)
 * - printService.ts (print/export)
 *
 * The stroke rendering exactly matches DrawingCanvas.tsx drawSegment.
 */

import type { SerializedPath } from '../components/DrawingCanvas';

interface Point {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
}

/** Render a single line segment (matches DrawingCanvas.drawSegment) */
export function renderSegment(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  tool: string,
  color: string,
  size: number
) {
  ctx.save();

  let lineWidth = size;
  const p = to.pressure > 0 ? to.pressure : 0.5;
  lineWidth = size * (0.1 + p * 1.8);

  if (tool === 'pen' && (Math.abs(to.tiltX) > 15 || Math.abs(to.tiltY) > 15)) {
    const tiltFactor = 1 + (Math.abs(to.tiltX) + Math.abs(to.tiltY)) / 180;
    lineWidth *= tiltFactor;
  }

  switch (tool) {
    case 'eraser':
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = size * 4;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      break;
    case 'highlighter':
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = size * 5;
      ctx.strokeStyle = color;
      break;
    case 'marker':
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = lineWidth * 2.5;
      ctx.strokeStyle = color;
      break;
    default:
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = color;
      break;
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  ctx.quadraticCurveTo(from.x, from.y, mx, my);
  ctx.stroke();
  ctx.restore();
}

/** Render all paths onto a context */
export function renderPaths(ctx: CanvasRenderingContext2D, paths: SerializedPath[]) {
  for (const path of paths) {
    if (path.points.length < 2) continue;
    for (let i = 1; i < path.points.length; i++) {
      renderSegment(ctx, path.points[i - 1], path.points[i], path.tool, path.color, path.size);
    }
  }
}

/** Render SerializedPath[] to a PNG data URL using an offscreen canvas */
export function renderPathsToDataURL(
  paths: SerializedPath[],
  width: number,
  height: number,
  options?: { scale?: number; background?: string }
): string {
  const scale = options?.scale ?? 1;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;

  if (options?.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (scale !== 1) ctx.scale(scale, scale);
  renderPaths(ctx, paths);

  const dataURL = canvas.toDataURL('image/png');
  // Clean up
  canvas.width = 0;
  canvas.height = 0;
  return dataURL;
}
