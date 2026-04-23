import { describe, it, expect } from 'vitest';
import {
  migrateStrokes,
  Y_NORM_PAGE_HEIGHT,
  type MigrationDoc,
} from '../notabilityStrokeMigration';

/**
 * R13 follow-up for PR #21 / F3. The inline migration in
 * NotabilityEditor.tsx's initialData effect converts pre-F3 legacy
 * documents (y normalized by width) to the new encoding (y normalized
 * by PAGE_HEIGHT). Without this test, the migration branch never runs
 * in CI — only new-encoding documents are exercised by the Playwright
 * F3 test.
 */
describe('migrateStrokes — F3 legacy → new y-normalization', () => {
  const PAGE_HEIGHT = 1200;

  it('returns the doc unchanged when yNormBase is already the new encoding', () => {
    const doc: MigrationDoc = {
      yNormBase: Y_NORM_PAGE_HEIGHT,
      strokes: [{ points: [{ x: 0.5, y: 0.5 }] }],
    };
    const out = migrateStrokes(doc, 820, PAGE_HEIGHT);
    // No scaling applied — y stayed at 0.5.
    expect(out.strokes![0].points[0].y).toBe(0.5);
    expect(out.yNormBase).toBe(Y_NORM_PAGE_HEIGHT);
  });

  it('preserves y_pixel across the encoding change (the whole point)', () => {
    // Legacy encoding: y_pixel = y_legacy * capture_width.
    // If capture_width = 820 and y_legacy = 0.5, then y_pixel = 410.
    // After migration: y_pixel should STILL be 410.
    // New encoding: y_pixel = y_new * PAGE_HEIGHT, so y_new = 410 / 1200 = 0.3417.
    const doc: MigrationDoc = {
      strokes: [{ points: [{ x: 0.25, y: 0.5 }] }],
    };
    migrateStrokes(doc, 820, PAGE_HEIGHT);
    const migratedY = doc.strokes![0].points[0].y;
    // migratedY * PAGE_HEIGHT must equal 0.5 * 820.
    expect(migratedY * PAGE_HEIGHT).toBeCloseTo(0.5 * 820, 5);
    // x must be unchanged — migration is y-only.
    expect(doc.strokes![0].points[0].x).toBe(0.25);
  });

  it('sets yNormBase after migrating so the next load is a no-op', () => {
    const doc: MigrationDoc = {
      strokes: [{ points: [{ x: 0.1, y: 0.2 }] }],
    };
    migrateStrokes(doc, 820, PAGE_HEIGHT);
    expect(doc.yNormBase).toBe(Y_NORM_PAGE_HEIGHT);
    // Second migrate call must not scale again.
    const yAfterFirst = doc.strokes![0].points[0].y;
    migrateStrokes(doc, 820, PAGE_HEIGHT);
    expect(doc.strokes![0].points[0].y).toBe(yAfterFirst);
  });

  it('migrates every point of every stroke (not just the first)', () => {
    const doc: MigrationDoc = {
      strokes: [
        { points: [{ x: 0, y: 0.1 }, { x: 0.5, y: 0.2 }, { x: 1, y: 0.3 }] },
        { points: [{ x: 0.2, y: 0.4 }, { x: 0.8, y: 0.5 }] },
      ],
    };
    migrateStrokes(doc, 600, PAGE_HEIGHT);
    const scale = 600 / PAGE_HEIGHT;
    expect(doc.strokes![0].points[0].y).toBeCloseTo(0.1 * scale, 10);
    expect(doc.strokes![0].points[1].y).toBeCloseTo(0.2 * scale, 10);
    expect(doc.strokes![0].points[2].y).toBeCloseTo(0.3 * scale, 10);
    expect(doc.strokes![1].points[0].y).toBeCloseTo(0.4 * scale, 10);
    expect(doc.strokes![1].points[1].y).toBeCloseTo(0.5 * scale, 10);
  });

  it('handles a doc with no strokes gracefully', () => {
    const doc: MigrationDoc = {};
    migrateStrokes(doc, 820, PAGE_HEIGHT);
    expect(doc.yNormBase).toBe(Y_NORM_PAGE_HEIGHT);
  });
});
