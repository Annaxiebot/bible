/** mountRoot — the prerendered fallback is removed before React mounts (no duplicate DOM). */
import { describe, it, expect } from 'vitest';
import { takeOverRoot } from '../mountRoot';

describe('takeOverRoot', () => {
  it('empties #root and clears the hash-route guard class', () => {
    document.body.innerHTML = '<div id="root"><div id="stl-fallback"><main id="main-content"><h1>x</h1></main></div></div>';
    document.documentElement.classList.add('stl-app-route');
    const root = takeOverRoot();
    expect(root.id).toBe('root');
    expect(root.childNodes.length).toBe(0);
    expect(document.getElementById('stl-fallback')).toBeNull();
    expect(document.documentElement.classList.contains('stl-app-route')).toBe(false);
  });

  it('throws without a root', () => {
    document.body.innerHTML = '';
    expect(() => takeOverRoot()).toThrow(/root/);
  });

  it('index.tsx takes over the root before rendering', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(`${__dirname}/../../index.tsx`, 'utf8');
    expect(src.indexOf('takeOverRoot()')).toBeGreaterThan(-1);
    expect(src.indexOf('takeOverRoot()')).toBeLessThan(src.indexOf('createRoot('));
  });
});
