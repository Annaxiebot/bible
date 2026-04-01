import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeCSS } from '../customizationService';

function makeStorage() {
  const store: Record<string, string> = {};
  return { getItem: vi.fn((k: string) => store[k] ?? null), setItem: vi.fn((k: string, v: string) => { store[k] = v; }), removeItem: vi.fn((k: string) => { delete store[k]; }), clear: vi.fn(), length: 0, key: vi.fn() };
}

describe('customizationService', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', makeStorage()); vi.stubGlobal('document', { createElement: vi.fn(() => ({ id: '', textContent: '', setAttribute: vi.fn() })), head: { appendChild: vi.fn() } }); });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('sanitizeCSS', () => {
    it('passes through normal CSS', () => { expect(sanitizeCSS('.a { color: red; }')).toBe('.a { color: red; }'); });
    it('blocks @import', () => { expect(sanitizeCSS('@import url("x"); .a { color: red; }')).not.toMatch(/@import\s+url/); });
    it('blocks javascript:', () => { expect(sanitizeCSS('.a { background: url(javascript:x); }')).not.toContain('javascript:'); });
    it('blocks expression()', () => { expect(sanitizeCSS('.a { width: expression(x); }')).not.toContain('expression('); });
    it('blocks -moz-binding', () => { expect(sanitizeCSS('.a { -moz-binding: url(x); }')).not.toContain('-moz-binding'); });
    it('blocks behavior', () => { expect(sanitizeCSS('.a { behavior: url(x); }')).not.toMatch(/behavior\s*:/); });
    it('trims whitespace', () => { expect(sanitizeCSS('  .a { }  ')).toBe('.a { }'); });
    it('handles empty', () => { expect(sanitizeCSS('')).toBe(''); });
    it('handles multiple patterns', () => { const r = sanitizeCSS('@import "x"; .a { behavior: url(x); }'); expect(r).not.toMatch(/@import\s+"/); expect(r).not.toMatch(/behavior\s*:/); });
  });

  describe('CustomizationService', () => {
    it('can be imported', async () => { const m = await import('../customizationService'); expect(m.customizationService.getAll).toBeDefined(); });
    it('getState shape', async () => { const m = await import('../customizationService'); const s = m.customizationService.getState(); expect(s).toHaveProperty('customizations'); expect(s).toHaveProperty('activeCSS'); });
    it('exportMetadata excludes isActive', async () => { const m = await import('../customizationService'); for (const e of m.customizationService.exportMetadata()) expect(e).not.toHaveProperty('isActive'); });
  });
});
