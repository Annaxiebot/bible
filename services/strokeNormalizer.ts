/**
 * strokeNormalizer.ts
 *
 * Converts stroke data between absolute pixel coordinates and
 * normalized (percentage-based) coordinates for responsive annotations.
 *
 * Normalized strokes store x/y as fractions (0-1) of container width/height,
 * and lineWidth as a fraction of container width. This ensures annotations
 * look correct at any screen size.
 */

/** A single point in a stroke (absolute pixels) */
export interface StrokePoint {
  x: number;
  y: number;
}

/** A single point in a stroke (normalized 0-1) */
export interface NormalizedPoint {
  x: number; // 0-1, fraction of container width
  y: number; // 0-1, fraction of container height
}

/** Tool type for drawing */
export type StrokeTool = 'pen' | 'marker' | 'highlighter' | 'eraser';

/** A complete stroke with absolute pixel coordinates */
export interface AbsoluteStroke {
  points: StrokePoint[];
  color: string;
  lineWidth: number;
  tool: StrokeTool;
  opacity: number;
}

/** A complete stroke with normalized coordinates */
export interface NormalizedStroke {
  points: NormalizedPoint[];
  color: string;
  /** lineWidth as fraction of container width */
  lineWidth: number;
  tool: StrokeTool;
  opacity: number;
}

/** Canvas data format version 2: normalized strokes */
export interface NormalizedCanvasData {
  version: 2;
  strokes: NormalizedStroke[];
  /** Paper background type */
  paperType?: PaperType;
}

/** Legacy canvas data: either a data URL string or version-1 stroke array */
export type LegacyCanvasData = string;

export type PaperType = 'plain' | 'grid' | 'ruled';

/**
 * Convert an absolute stroke to a normalized stroke.
 */
export function normalizeStroke(
  stroke: AbsoluteStroke,
  containerWidth: number,
  containerHeight: number
): NormalizedStroke {
  if (containerWidth <= 0 || containerHeight <= 0) {
    throw new Error('Container dimensions must be positive');
  }

  return {
    points: stroke.points.map((p) => ({
      x: p.x / containerWidth,
      y: p.y / containerHeight,
    })),
    color: stroke.color,
    lineWidth: stroke.lineWidth / containerWidth,
    tool: stroke.tool,
    opacity: stroke.opacity,
  };
}

/**
 * Convert a normalized stroke back to absolute pixels.
 */
export function denormalizeStroke(
  stroke: NormalizedStroke,
  containerWidth: number,
  containerHeight: number
): AbsoluteStroke {
  if (containerWidth <= 0 || containerHeight <= 0) {
    throw new Error('Container dimensions must be positive');
  }

  return {
    points: stroke.points.map((p) => ({
      x: p.x * containerWidth,
      y: p.y * containerHeight,
    })),
    color: stroke.color,
    lineWidth: stroke.lineWidth * containerWidth,
    tool: stroke.tool,
    opacity: stroke.opacity,
  };
}

/**
 * Normalize all strokes in a batch.
 */
export function normalizeStrokes(
  strokes: AbsoluteStroke[],
  containerWidth: number,
  containerHeight: number
): NormalizedStroke[] {
  return strokes.map((s) => normalizeStroke(s, containerWidth, containerHeight));
}

/**
 * Denormalize all strokes in a batch.
 */
export function denormalizeStrokes(
  strokes: NormalizedStroke[],
  containerWidth: number,
  containerHeight: number
): AbsoluteStroke[] {
  return strokes.map((s) => denormalizeStroke(s, containerWidth, containerHeight));
}

/**
 * Serialize normalized canvas data to a JSON string for storage.
 */
export function serializeCanvasData(data: NormalizedCanvasData): string {
  return JSON.stringify(data);
}

/**
 * Detect whether stored canvas data is in the legacy raster format (data URL)
 * or the new normalized stroke format (version 2 JSON).
 */
export function isNormalizedFormat(canvasData: string): boolean {
  if (!canvasData || canvasData.startsWith('data:image')) {
    return false;
  }
  try {
    const parsed = JSON.parse(canvasData);
    return parsed && parsed.version === 2;
  } catch {
    return false;
  }
}

/**
 * Parse stored canvas data. Returns NormalizedCanvasData if format is version 2,
 * or null if it's a legacy format.
 */
export function parseCanvasData(canvasData: string): NormalizedCanvasData | null {
  if (!canvasData) return null;
  if (canvasData.startsWith('data:image')) return null;
  try {
    const parsed = JSON.parse(canvasData);
    if (parsed && parsed.version === 2) {
      return parsed as NormalizedCanvasData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create an empty NormalizedCanvasData structure.
 */
export function createEmptyCanvasData(paperType: PaperType = 'plain'): NormalizedCanvasData {
  return {
    version: 2,
    strokes: [],
    paperType,
  };
}

/**
 * Get tool-specific rendering properties for drawing a stroke on a canvas context.
 */
export function getToolRenderProps(tool: StrokeTool, color: string, lineWidth: number) {
  switch (tool) {
    case 'eraser':
      return {
        compositeOp: 'destination-out' as GlobalCompositeOperation,
        alpha: 1.0,
        strokeStyle: color,
        width: lineWidth * 3,
      };
    case 'highlighter':
      return {
        compositeOp: 'multiply' as GlobalCompositeOperation,
        alpha: 0.25,
        strokeStyle: color,
        width: lineWidth * 5,
      };
    case 'marker':
      return {
        compositeOp: 'source-over' as GlobalCompositeOperation,
        alpha: 0.7,
        strokeStyle: color,
        width: lineWidth * 2.5,
      };
    default: // pen
      return {
        compositeOp: 'source-over' as GlobalCompositeOperation,
        alpha: 1.0,
        strokeStyle: color,
        width: lineWidth,
      };
  }
}

/**
 * Render a single absolute stroke onto a canvas 2D context.
 */
export function renderStroke(ctx: CanvasRenderingContext2D, stroke: AbsoluteStroke): void {
  if (stroke.points.length < 2) return;

  const props = getToolRenderProps(stroke.tool, stroke.color, stroke.lineWidth);

  ctx.save();
  ctx.globalCompositeOperation = props.compositeOp;
  ctx.globalAlpha = props.alpha;
  ctx.strokeStyle = props.strokeStyle;
  ctx.lineWidth = props.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Render all strokes from NormalizedCanvasData onto a canvas context,
 * denormalizing to the given container dimensions.
 */
export function renderAllStrokes(
  ctx: CanvasRenderingContext2D,
  data: NormalizedCanvasData,
  containerWidth: number,
  containerHeight: number
): void {
  const absoluteStrokes = denormalizeStrokes(data.strokes, containerWidth, containerHeight);
  for (const stroke of absoluteStrokes) {
    renderStroke(ctx, stroke);
  }
}

/**
 * Draw paper background (grid or ruled lines) on a canvas context.
 */
export function drawPaperBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  paperType: PaperType
): void {
  // Clear and fill white
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  if (paperType === 'grid') {
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    // ~30 cells across width for even grid
    const spacing = Math.round(width / 30);

    for (let x = 0; x <= width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y <= height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (paperType === 'ruled') {
    // College-ruled: ~8mm equivalent spacing
    // At typical screen DPI, 8mm ~ 30px. Use proportional spacing based on height.
    const lineSpacing = Math.max(24, Math.round(height / 20));

    // Horizontal ruled lines
    ctx.strokeStyle = '#C8D8F0';
    ctx.lineWidth = 1;
    for (let y = lineSpacing; y < height; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Red margin line
    ctx.strokeStyle = '#FFD5D5';
    ctx.lineWidth = 1.5;
    const marginX = Math.round(width / 15);
    ctx.beginPath();
    ctx.moveTo(marginX, 0);
    ctx.lineTo(marginX, height);
    ctx.stroke();
  }
}
