import { describe, it, expect } from 'vitest';
import {
  normalizeStroke,
  denormalizeStroke,
  normalizeStrokes,
  denormalizeStrokes,
  serializeCanvasData,
  parseCanvasData,
  isNormalizedFormat,
  createEmptyCanvasData,
  drawPaperBackground,
  renderStroke,
  renderStrokesByLayer,
  getToolRenderProps,
  type AbsoluteStroke,
  type NormalizedStroke,
  type NormalizedCanvasData,
} from '../strokeNormalizer';

describe('strokeNormalizer', () => {
  const sampleAbsoluteStroke: AbsoluteStroke = {
    points: [
      { x: 100, y: 50 },
      { x: 200, y: 100 },
      { x: 300, y: 150 },
    ],
    color: '#ff0000',
    lineWidth: 4,
    tool: 'pen',
    opacity: 1.0,
  };

  const containerWidth = 1000;
  const containerHeight = 500;

  describe('normalizeStroke', () => {
    it('converts absolute coordinates to normalized fractions', () => {
      const result = normalizeStroke(sampleAbsoluteStroke, containerWidth, containerHeight);

      expect(result.points[0].x).toBeCloseTo(0.1);
      expect(result.points[0].y).toBeCloseTo(0.1);
      expect(result.points[1].x).toBeCloseTo(0.2);
      expect(result.points[1].y).toBeCloseTo(0.2);
      expect(result.points[2].x).toBeCloseTo(0.3);
      expect(result.points[2].y).toBeCloseTo(0.3);
    });

    it('normalizes lineWidth as fraction of container width', () => {
      const result = normalizeStroke(sampleAbsoluteStroke, containerWidth, containerHeight);
      expect(result.lineWidth).toBeCloseTo(0.004);
    });

    it('preserves color, tool, and opacity', () => {
      const result = normalizeStroke(sampleAbsoluteStroke, containerWidth, containerHeight);
      expect(result.color).toBe('#ff0000');
      expect(result.tool).toBe('pen');
      expect(result.opacity).toBe(1.0);
    });

    it('throws when container dimensions are zero or negative', () => {
      expect(() => normalizeStroke(sampleAbsoluteStroke, 0, 500)).toThrow('Container dimensions must be positive');
      expect(() => normalizeStroke(sampleAbsoluteStroke, 500, -1)).toThrow('Container dimensions must be positive');
    });
  });

  describe('denormalizeStroke', () => {
    it('converts normalized coordinates back to absolute pixels', () => {
      const normalized = normalizeStroke(sampleAbsoluteStroke, containerWidth, containerHeight);
      const result = denormalizeStroke(normalized, containerWidth, containerHeight);

      expect(result.points[0].x).toBeCloseTo(100);
      expect(result.points[0].y).toBeCloseTo(50);
      expect(result.points[1].x).toBeCloseTo(200);
      expect(result.points[1].y).toBeCloseTo(100);
      expect(result.lineWidth).toBeCloseTo(4);
    });

    it('scales correctly to different container dimensions', () => {
      const normalized = normalizeStroke(sampleAbsoluteStroke, containerWidth, containerHeight);
      // Render on a 500x250 container (half size)
      const result = denormalizeStroke(normalized, 500, 250);

      expect(result.points[0].x).toBeCloseTo(50);
      expect(result.points[0].y).toBeCloseTo(25);
      expect(result.points[1].x).toBeCloseTo(100);
      expect(result.points[1].y).toBeCloseTo(50);
      expect(result.lineWidth).toBeCloseTo(2);
    });

    it('throws when container dimensions are zero or negative', () => {
      const normalized: NormalizedStroke = {
        points: [{ x: 0.5, y: 0.5 }],
        color: '#000',
        lineWidth: 0.01,
        tool: 'pen',
        opacity: 1,
      };
      expect(() => denormalizeStroke(normalized, 0, 500)).toThrow();
      expect(() => denormalizeStroke(normalized, 500, 0)).toThrow();
    });
  });

  describe('roundtrip: normalize then denormalize', () => {
    it('preserves stroke data within floating point tolerance', () => {
      const normalized = normalizeStroke(sampleAbsoluteStroke, containerWidth, containerHeight);
      const restored = denormalizeStroke(normalized, containerWidth, containerHeight);

      for (let i = 0; i < sampleAbsoluteStroke.points.length; i++) {
        expect(restored.points[i].x).toBeCloseTo(sampleAbsoluteStroke.points[i].x, 5);
        expect(restored.points[i].y).toBeCloseTo(sampleAbsoluteStroke.points[i].y, 5);
      }
      expect(restored.lineWidth).toBeCloseTo(sampleAbsoluteStroke.lineWidth, 5);
    });
  });

  describe('normalizeStrokes / denormalizeStrokes (batch)', () => {
    it('processes multiple strokes', () => {
      const stroke2: AbsoluteStroke = {
        points: [{ x: 500, y: 250 }],
        color: '#00ff00',
        lineWidth: 2,
        tool: 'highlighter',
        opacity: 0.25,
      };

      const normalized = normalizeStrokes([sampleAbsoluteStroke, stroke2], containerWidth, containerHeight);
      expect(normalized).toHaveLength(2);
      expect(normalized[0].points[0].x).toBeCloseTo(0.1);
      expect(normalized[1].points[0].x).toBeCloseTo(0.5);
      expect(normalized[1].points[0].y).toBeCloseTo(0.5);

      const restored = denormalizeStrokes(normalized, containerWidth, containerHeight);
      expect(restored).toHaveLength(2);
      expect(restored[1].points[0].x).toBeCloseTo(500);
    });
  });

  describe('serializeCanvasData / parseCanvasData', () => {
    it('round-trips NormalizedCanvasData through JSON', () => {
      const data: NormalizedCanvasData = {
        version: 2,
        strokes: [
          {
            points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
            color: '#000',
            lineWidth: 0.005,
            tool: 'pen',
            opacity: 1.0,
          },
        ],
        paperType: 'grid',
      };

      const serialized = serializeCanvasData(data);
      expect(typeof serialized).toBe('string');

      const parsed = parseCanvasData(serialized);
      expect(parsed).not.toBeNull();
      expect(parsed!.version).toBe(2);
      expect(parsed!.strokes).toHaveLength(1);
      expect(parsed!.paperType).toBe('grid');
      expect(parsed!.strokes[0].points[0].x).toBeCloseTo(0.1);
    });
  });

  describe('isNormalizedFormat', () => {
    it('returns true for version 2 JSON', () => {
      const data: NormalizedCanvasData = { version: 2, strokes: [], paperType: 'plain' };
      expect(isNormalizedFormat(JSON.stringify(data))).toBe(true);
    });

    it('returns false for data URL strings', () => {
      expect(isNormalizedFormat('data:image/png;base64,abc123')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isNormalizedFormat('')).toBe(false);
    });

    it('returns false for invalid JSON', () => {
      expect(isNormalizedFormat('not json')).toBe(false);
    });

    it('returns false for JSON without version 2', () => {
      expect(isNormalizedFormat(JSON.stringify({ version: 1, paths: [] }))).toBe(false);
    });
  });

  describe('parseCanvasData', () => {
    it('returns null for empty string', () => {
      expect(parseCanvasData('')).toBeNull();
    });

    it('returns null for data URL', () => {
      expect(parseCanvasData('data:image/png;base64,abc')).toBeNull();
    });

    it('returns null for non-v2 JSON', () => {
      expect(parseCanvasData(JSON.stringify({ version: 1 }))).toBeNull();
    });
  });

  describe('createEmptyCanvasData', () => {
    it('creates an empty canvas data with default paper type', () => {
      const data = createEmptyCanvasData();
      expect(data.version).toBe(2);
      expect(data.strokes).toEqual([]);
      expect(data.paperType).toBe('plain');
    });

    it('creates an empty canvas data with specified paper type', () => {
      const data = createEmptyCanvasData('ruled');
      expect(data.paperType).toBe('ruled');
    });
  });

  describe('getToolRenderProps', () => {
    it('returns correct properties for pen tool', () => {
      const props = getToolRenderProps('pen', '#000', 4);
      expect(props.compositeOp).toBe('source-over');
      expect(props.alpha).toBe(1.0);
      expect(props.width).toBe(4);
    });

    it('returns correct properties for eraser tool', () => {
      const props = getToolRenderProps('eraser', '#000', 4);
      expect(props.compositeOp).toBe('destination-out');
      expect(props.alpha).toBe(1.0);
      expect(props.width).toBe(12); // 4 * 3
    });

    it('returns correct properties for highlighter tool', () => {
      const props = getToolRenderProps('highlighter', '#ff0', 4);
      expect(props.compositeOp).toBe('multiply');
      expect(props.alpha).toBe(0.25);
      expect(props.width).toBe(20); // 4 * 5
    });

    it('returns correct properties for marker tool', () => {
      const props = getToolRenderProps('marker', '#00f', 4);
      expect(props.compositeOp).toBe('source-over');
      expect(props.alpha).toBe(0.7);
      expect(props.width).toBe(10); // 4 * 2.5
    });
  });

  describe('drawPaperBackground', () => {
    const createMockContext = () => {
      const calls: string[] = [];
      return {
        clearRect: (...args: number[]) => calls.push(`clearRect(${args.join(',')})`),
        fillRect: (...args: number[]) => calls.push(`fillRect(${args.join(',')})`),
        beginPath: () => calls.push('beginPath'),
        moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
        lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
        stroke: () => calls.push('stroke'),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        calls,
      } as unknown as CanvasRenderingContext2D;
    };

    it('draws white background for plain paper', () => {
      const ctx = createMockContext();
      drawPaperBackground(ctx, 300, 200, 'plain');
      expect((ctx as any).calls).toContain('clearRect(0,0,300,200)');
      expect((ctx as any).calls).toContain('fillRect(0,0,300,200)');
      expect((ctx as any).calls.filter((c: string) => c === 'stroke')).toHaveLength(0);
    });

    it('draws grid lines for grid paper', () => {
      const ctx = createMockContext();
      drawPaperBackground(ctx, 300, 200, 'grid');
      const strokeCount = (ctx as any).calls.filter((c: string) => c === 'stroke').length;
      expect(strokeCount).toBeGreaterThan(10);
    });

    it('draws horizontal lines and margin for ruled paper', () => {
      const ctx = createMockContext();
      drawPaperBackground(ctx, 300, 600, 'ruled');
      const strokeCalls = (ctx as any).calls.filter((c: string) => c === 'stroke').length;
      expect(strokeCalls).toBeGreaterThan(2);
    });
  });

  describe('renderStroke', () => {
    it('does not render strokes with fewer than 2 points', () => {
      const ctx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        stroke: () => {},
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        strokeStyle: '#000',
        lineWidth: 1,
        lineCap: 'round',
        lineJoin: 'round',
      } as unknown as CanvasRenderingContext2D;

      const singlePointStroke: AbsoluteStroke = {
        points: [{ x: 10, y: 20 }],
        color: '#000',
        lineWidth: 2,
        tool: 'pen',
        opacity: 1,
      };

      // Should not throw
      renderStroke(ctx, singlePointStroke);
    });
  });

  describe('renderStrokesByLayer', () => {
    it('filters strokes by layer property', () => {
      const renderedStrokes: string[] = [];
      const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => renderedStrokes.push('stroke'),
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        strokeStyle: '#000',
        lineWidth: 1,
        lineCap: 'round',
        lineJoin: 'round',
      } as unknown as CanvasRenderingContext2D;

      const data: NormalizedCanvasData = {
        version: 2,
        strokes: [
          { points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], color: '#000', lineWidth: 0.01, tool: 'pen', opacity: 1 },
          { points: [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }], color: '#f00', lineWidth: 0.01, tool: 'pen', opacity: 1, layer: 'above' },
          { points: [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }], color: '#00f', lineWidth: 0.01, tool: 'pen', opacity: 1, layer: 'below' },
        ],
      };

      // Render only 'below' layer — should include stroke 0 (no layer = default below) and stroke 2
      renderStrokesByLayer(mockCtx, data, 1000, 1000, 'below');
      expect(renderedStrokes).toHaveLength(2);

      renderedStrokes.length = 0;
      // Render only 'above' layer — should include only stroke 1
      renderStrokesByLayer(mockCtx, data, 1000, 1000, 'above');
      expect(renderedStrokes).toHaveLength(1);
    });

    it('returns no strokes when filtering for layer with no matches', () => {
      const renderedStrokes: string[] = [];
      const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => renderedStrokes.push('stroke'),
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        strokeStyle: '#000',
        lineWidth: 1,
        lineCap: 'round',
        lineJoin: 'round',
      } as unknown as CanvasRenderingContext2D;

      const data: NormalizedCanvasData = {
        version: 2,
        strokes: [
          { points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], color: '#000', lineWidth: 0.01, tool: 'pen', opacity: 1 },
        ],
      };

      // All strokes default to 'below', so 'above' should have 0
      renderStrokesByLayer(mockCtx, data, 1000, 1000, 'above');
      expect(renderedStrokes).toHaveLength(0);
    });

    it('handles strokes without layer property as below by default', () => {
      const renderedStrokes: string[] = [];
      const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => renderedStrokes.push('stroke'),
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        strokeStyle: '#000',
        lineWidth: 1,
        lineCap: 'round',
        lineJoin: 'round',
      } as unknown as CanvasRenderingContext2D;

      const data: NormalizedCanvasData = {
        version: 2,
        strokes: [
          { points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], color: '#000', lineWidth: 0.01, tool: 'pen', opacity: 1 },
          { points: [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }], color: '#f00', lineWidth: 0.01, tool: 'pen', opacity: 1 },
        ],
      };

      renderStrokesByLayer(mockCtx, data, 1000, 1000, 'below');
      expect(renderedStrokes).toHaveLength(2);
    });
  });

  describe('NormalizedStroke layer property', () => {
    it('preserves layer through serialization roundtrip', () => {
      const data: NormalizedCanvasData = {
        version: 2,
        strokes: [
          { points: [{ x: 0.1, y: 0.2 }], color: '#000', lineWidth: 0.005, tool: 'pen', opacity: 1.0, layer: 'above' },
          { points: [{ x: 0.3, y: 0.4 }], color: '#f00', lineWidth: 0.005, tool: 'pen', opacity: 1.0, layer: 'below' },
          { points: [{ x: 0.5, y: 0.6 }], color: '#00f', lineWidth: 0.005, tool: 'pen', opacity: 1.0 },
        ],
        paperType: 'plain',
      };

      const serialized = serializeCanvasData(data);
      const parsed = parseCanvasData(serialized);
      expect(parsed).not.toBeNull();
      expect(parsed!.strokes[0].layer).toBe('above');
      expect(parsed!.strokes[1].layer).toBe('below');
      expect(parsed!.strokes[2].layer).toBeUndefined();
    });
  });
});
