/**
 * openrouter.test.ts — the one OpenRouter constant the app keeps · OpenRouter 常量
 *
 * The browser never calls OpenRouter since the own-key path was removed
 * (ADR-0007, 2026-10-23); only the free-router id (an older stored model
 * choice maps to it) remains.
 */
import { describe, it, expect } from 'vitest';
import * as openrouter from '../openrouter';

describe('openrouter', () => {
  it('FREE_ROUTER_MODEL is the id OpenRouter lists for its free router', () => {
    expect(openrouter.FREE_ROUTER_MODEL).toBe('openrouter/free');
  });

  it('no key reader, key test or chat URL is left in the browser bundle', () => {
    expect(Object.keys(openrouter)).toEqual(['FREE_ROUTER_MODEL']);
  });
});
