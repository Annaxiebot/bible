/**
 * LandingNav.test.tsx — sticky three-link nav · 页内导航测试
 *
 * Three buttons (never hash links: a hash would route away from the
 * landing), each scrolling its section into view. The full landing mounts
 * so the targets exist.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import LandingNav from '../LandingNav';
import Landing from '../Landing';
import { NAV_LINKS, NAV_LABEL, NEXT_NONE_YET } from '../landingStrings';

describe('LandingNav', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders one button per NAV_LINKS entry, Chinese first, with no anchors', () => {
    render(<LandingNav />);
    const nav = screen.getByRole('navigation', { name: NAV_LABEL });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons).toHaveLength(NAV_LINKS.length);
    expect(NAV_LINKS).toHaveLength(2);
    expect(nav.querySelectorAll('a')).toHaveLength(0);
    NAV_LINKS.forEach((link, i) => {
      expect(buttons[i].textContent).toBe(`${link.zh}${link.en}`);
    });
  });

  it('each link scrolls its section into view on the full landing', async () => {
    render(<Landing />);
    await screen.findByText(NEXT_NONE_YET);  // the stubbed 404 has settled
    for (const link of NAV_LINKS) {
      const target = document.getElementById(link.id);
      expect(target, link.id).not.toBeNull();
      fireEvent.click(screen.getByTestId(`nav-${link.id}`));
      expect(target!.scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'smooth' });
    }
    expect(screen.getByTestId('card-group')).toHaveAttribute('id', 'group');
    expect(screen.getByTestId('card-personal')).toHaveAttribute('id', 'personal');
  });

  it('scrolls instantly when the user prefers reduced motion (ADR-0003 §16)', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    render(<Landing />);
    await screen.findByText(NEXT_NONE_YET);
    fireEvent.click(screen.getByTestId('nav-personal'));
    expect(document.getElementById('personal')!.scrollIntoView)
      .toHaveBeenLastCalledWith({ block: 'start', behavior: 'auto' });
  });
});
