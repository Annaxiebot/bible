/**
 * SkipLink.tsx — keyboard "skip to main content" link · 跳到主要内容
 *
 * First focusable element on a page; hidden until focused (.stl-skip-link,
 * index.html). It moves focus to the page's <main id="main-content"
 * tabIndex={-1}> itself instead of following the href: in this app any hash
 * other than the bare root is a route (landingRoute.ts), so letting the
 * browser set "#main-content" would leave the page.
 */
import React from 'react';
import { MAIN_CONTENT_ID, SKIP_LINK_LABEL } from './skipLinkStrings';

export { MAIN_CONTENT_ID, SKIP_LINK_LABEL };

export function focusMainContent(id: string = MAIN_CONTENT_ID): void {
  const target = document.getElementById(id);
  if (!target) return;
  target.focus();
  target.scrollIntoView?.({ block: 'start' });
}

const SkipLink: React.FC<{ targetId?: string; label?: string }> = ({ targetId = MAIN_CONTENT_ID, label = SKIP_LINK_LABEL }) => (
  <a
    href={`#${targetId}`}
    className="stl-skip-link"
    data-testid="skip-link"
    onClick={(e) => {
      e.preventDefault();
      focusMainContent(targetId);
    }}
  >
    {label}
  </a>
);

export default SkipLink;
