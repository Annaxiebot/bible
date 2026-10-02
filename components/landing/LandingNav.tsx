/**
 * LandingNav.tsx — sticky three-link top nav · 頁內導航
 *
 * Three large tap targets (≥48px) that scroll to the group card, the
 * personal card. They are buttons, not hash
 * links: any hash other than the bare root routes away from the landing
 * (landingRoute.ts), so navigation stays in-page via scrollIntoView. The
 * scroll is smooth unless the user prefers reduced motion (decided here, in
 * JS, so wheel/touch scrolling stays native); the nav itself is always
 * visible — it is content, not decoration. No hamburger: three links fit a
 * phone width.
 */
import React from 'react';
import { NAV_LINKS, NAV_LABEL, NavSectionId } from './landingStrings';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Scroll the landing's own scroll container to a section by id. */
export function scrollToSection(id: NavSectionId): void {
  const behavior: ScrollBehavior = window.matchMedia(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth';
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior });
}

const LandingNav: React.FC = () => (
  <nav aria-label={NAV_LABEL} data-testid="landing-nav" className="ld-nav sticky top-0 z-10">
    <ul className="mx-auto flex max-w-4xl justify-center gap-1 px-2 sm:gap-4">
      {NAV_LINKS.map(link => (
        <li key={link.id}>
          <button
            type="button"
            onClick={() => scrollToSection(link.id)}
            data-testid={`nav-${link.id}`}
            className="ld-nav-link rounded-xl text-slate-200 hover:text-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <span className="font-serif-sc">{link.zh}</span>
            <span className="text-slate-400">{link.en}</span>
          </button>
        </li>
      ))}
    </ul>
  </nav>
);

export default LandingNav;
