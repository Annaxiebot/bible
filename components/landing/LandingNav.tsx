/**
 * LandingNav.tsx — sticky top nav · 页内导航
 *
 * The brand (活出神的话 Scripture to Life, hidden on phones), two ≥48px
 * section links that scroll to the group band and personal study, and one
 * context-aware leader pill (LandingLeaderLink: "带领者登录 Leader sign-in"
 * signed out, the leader's name → #/leader signed in). The section links
 * are buttons, not hash links: any hash other than the bare root routes
 * away from the landing (landingRoute.ts), so navigation stays in-page via
 * scrollIntoView. The scroll is smooth unless the user prefers reduced
 * motion (decided here, in JS, so wheel/touch scrolling stays native).
 */
import React from 'react';
import { NAV_LINKS, NAV_LABEL, NavSectionId, BRAND_ZH, BRAND_EN } from './landingStrings';
import LandingLeaderLink from './LandingLeaderLink';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Scroll the landing's own scroll container to a section by id. */
export function scrollToSection(id: NavSectionId): void {
  const behavior: ScrollBehavior = window.matchMedia(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth';
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior });
}

/** One section link: Chinese, then the English half (hidden below 860px). */
export const SectionLink: React.FC<{ link: (typeof NAV_LINKS)[number]; className: string; testId?: string }> = ({
  link, className, testId,
}) => (
  <button type="button" onClick={() => scrollToSection(link.id)} data-testid={testId} className={className}>
    <span>{link.zh}</span><span className="ld-nav-en">{link.en}</span>
  </button>
);

const LandingNav: React.FC = () => (
  <nav aria-label={NAV_LABEL} data-testid="landing-nav" className="ld-nav">
    <div className="ld-wrap">
      <div className="ld-brand" aria-hidden="true">
        <span className="ld-brand-zh">{BRAND_ZH}</span><span className="ld-brand-en">{BRAND_EN}</span>
      </div>
      {NAV_LINKS.map(link => (
        <SectionLink key={link.id} link={link} className="ld-nav-link" testId={`nav-${link.id}`} />
      ))}
      <LandingLeaderLink />
    </div>
  </nav>
);

export default LandingNav;
