/**
 * Pill.tsx — the one CTA shape of the landing and the member pages · 按钮
 *
 * A gold (or ghost-outlined) pill, ≥ 48px (.stl-pill, styles/stlShared.css):
 * a link when given `href`, else a button (`type="submit"` for a form). The
 * "中文 English" label renders as a bold Chinese half and a lighter English
 * half; the accessible name stays the whole label (the arrow is aria-hidden).
 * Used by every landing CTA and the sign-up / check-in / stop / QR pages.
 */
import React from 'react';
import { splitLabel } from '../studypack/principles';

interface PillProps {
  label: string;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  ghost?: boolean;
  small?: boolean;
  arrow?: boolean;
  testId?: string;
  expanded?: boolean;
  disabled?: boolean;
  className?: string;
}

const PillLabel: React.FC<{ label: string; arrow?: boolean }> = ({ label, arrow }) => {
  const { zh, en } = splitLabel(label);
  return (
    <>
      <span>{zh}</span>
      {en && <>{' '}<span className="stl-pill-en">{en}</span></>}
      {arrow && <span className="stl-arrow" aria-hidden="true">→</span>}
    </>
  );
};

const Pill: React.FC<PillProps> = ({
  label, href, onClick, type = 'button', ghost, small, arrow, testId, expanded, disabled, className = '',
}) => {
  const cls = ['stl-pill', ghost && 'stl-pill-ghost', small && 'stl-pill-sm', className].filter(Boolean).join(' ');
  if (href) {
    return <a href={href} className={cls} data-testid={testId}><PillLabel label={label} arrow={arrow} /></a>;
  }
  return (
    <button type={type} onClick={onClick} className={cls} data-testid={testId} aria-expanded={expanded} disabled={disabled}>
      <PillLabel label={label} arrow={arrow} />
    </button>
  );
};

export default Pill;
