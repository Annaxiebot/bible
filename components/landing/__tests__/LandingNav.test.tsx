/**
 * LandingNav.test.tsx — sticky two-link nav + leader pill · 页内导航测试
 *
 * Section buttons (never hash links: a hash would route away from the
 * landing), each scrolling its section into view; the leader control is
 * covered in LandingLeaderLink.test.tsx. The full landing mounts
 * so the targets exist.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import LandingNav from '../LandingNav';
import Landing from '../Landing';
import { NAV_LINKS, NAV_LABEL, NEXT_NONE_YET, NAV_LEADER_SIGNIN, GROUP_QR_CTA, NEXT_SECTION_ID } from '../landingStrings';

describe('LandingNav', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders one button per NAV_LINKS entry, Chinese first, plus the leader sign-in button; no anchors signed out', () => {
    render(<LandingNav />);
    const nav = screen.getByRole('navigation', { name: NAV_LABEL });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons).toHaveLength(NAV_LINKS.length + 1);
    expect(NAV_LINKS).toHaveLength(2);
    expect(nav.querySelectorAll('a')).toHaveLength(0);
    NAV_LINKS.forEach((link, i) => {
      expect(buttons[i].textContent).toBe(`${link.zh}${link.en}`);
    });
    expect(buttons[NAV_LINKS.length].textContent).toBe(`${NAV_LEADER_SIGNIN.zh} ${NAV_LEADER_SIGNIN.en}`);
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
    expect(screen.getByTestId('section-group')).toHaveAttribute('id', 'group');
    expect(screen.getByTestId('section-personal')).toHaveAttribute('id', 'personal');
  });

  it('scrolls instantly when the user prefers reduced motion (ADR-0003 §16)', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    render(<Landing />);
    await screen.findByText(NEXT_NONE_YET);
    fireEvent.click(screen.getByTestId('nav-personal'));
    expect(document.getElementById('personal')!.scrollIntoView)
      .toHaveBeenLastCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('the group band\'s QR sign-up button scrolls to the next-study block (never a hash)', async () => {
    render(<Landing />);
    await screen.findByText(NEXT_NONE_YET);
    const qr = screen.getByTestId('group-qr');
    expect(qr.tagName).toBe('BUTTON');
    expect(qr.textContent).toBe(GROUP_QR_CTA);
    fireEvent.click(qr);
    expect(document.getElementById(NEXT_SECTION_ID)!.scrollIntoView)
      .toHaveBeenLastCalledWith({ block: 'start', behavior: 'smooth' });
  });
});
