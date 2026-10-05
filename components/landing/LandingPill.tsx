/**
 * LandingPill.tsx — the landing's one CTA shape · 首页按钮
 *
 * A gold (or ghost-outlined) pill, ≥ 48px, used by every landing CTA: a
 * link when given `href`, else a button. The "中文 English" label renders
 * as a bold Chinese half and a lighter English half; the accessible name
 * stays the whole label (the arrow is aria-hidden).
 */
import React from 'react';
import { splitLabel } from './landingStrings';

interface LandingPillProps {
  label: string;
  href?: string;
  onClick?: () => void;
  ghost?: boolean;
  small?: boolean;
  arrow?: boolean;
  testId?: string;
  expanded?: boolean;
  disabled?: boolean;
  className?: string;
}

export const PillLabel: React.FC<{ label: string; arrow?: boolean }> = ({ label, arrow }) => {
  const { zh, en } = splitLabel(label);
  return (
    <>
      <span>{zh}</span>
      {en && <>{' '}<span className="ld-pill-en">{en}</span></>}
      {arrow && <span className="ld-arrow" aria-hidden="true">→</span>}
    </>
  );
};

const LandingPill: React.FC<LandingPillProps> = ({
  label, href, onClick, ghost, small, arrow, testId, expanded, disabled, className = '',
}) => {
  const cls = ['ld-pill', ghost && 'ld-pill-ghost', small && 'ld-pill-sm', className].filter(Boolean).join(' ');
  if (href) {
    return <a href={href} className={cls} data-testid={testId}><PillLabel label={label} arrow={arrow} /></a>;
  }
  return (
    <button type="button" onClick={onClick} className={cls} data-testid={testId} aria-expanded={expanded} disabled={disabled}>
      <PillLabel label={label} arrow={arrow} />
    </button>
  );
};

export default LandingPill;
