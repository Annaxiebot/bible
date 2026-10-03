/**
 * landingIllustrations.tsx — hand-drawn SVG card art · 首页插图
 *
 * A TV showing a slide (group card) and a phone showing bilingual verses
 * (personal card). Amber/slate palette, decorative (aria-hidden).
 */
import React from 'react';

const ART_PROPS = {
  viewBox: '0 0 160 100',
  fill: 'none',
  'aria-hidden': true,
  className: 'ld-card-art h-24 w-auto sm:h-28',
};

/** A television showing a title slide with a glowing key line. */
export const TvIllustration: React.FC = () => (
  <svg {...ART_PROPS}>
    <rect x="12" y="10" width="136" height="76" rx="6" fill="var(--stl-surface)" stroke="var(--stl-surface-2)" strokeWidth="2" />
    <rect x="18" y="16" width="124" height="64" rx="3" fill="var(--stl-bg)" />
    <rect x="30" y="30" width="70" height="7" rx="2" fill="var(--stl-gold)" />
    <rect x="30" y="44" width="100" height="4" rx="2" fill="var(--stl-text-3)" />
    <rect x="30" y="54" width="84" height="4" rx="2" fill="var(--stl-text-3)" />
    <rect x="30" y="64" width="56" height="4" rx="2" fill="var(--stl-surface-2)" />
    <circle cx="124" cy="33" r="4" fill="var(--stl-gold)" opacity="0.8" />
    <path d="M60 90h40M80 86v4" stroke="var(--stl-surface-2)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** A phone showing a verse in two languages, side by side. */
export const PhoneIllustration: React.FC = () => (
  <svg {...ART_PROPS}>
    <rect x="52" y="4" width="56" height="92" rx="9" fill="var(--stl-surface)" stroke="var(--stl-surface-2)" strokeWidth="2" />
    <rect x="57" y="12" width="46" height="76" rx="4" fill="var(--stl-bg)" />
    <rect x="72" y="7" width="16" height="2.5" rx="1.25" fill="var(--stl-surface-2)" />
    <text x="62" y="27" fill="var(--stl-gold)" fontSize="9" fontFamily="'Noto Serif SC', serif">
      太 6:33
    </text>
    <rect x="62" y="33" width="36" height="3" rx="1.5" fill="var(--stl-text-2)" />
    <rect x="62" y="40" width="30" height="3" rx="1.5" fill="var(--stl-text-2)" />
    <rect x="62" y="47" width="34" height="3" rx="1.5" fill="var(--stl-text-2)" />
    <path d="M62 55h36" stroke="var(--stl-gold)" strokeWidth="1" strokeDasharray="2 2" />
    <rect x="62" y="61" width="36" height="3" rx="1.5" fill="var(--stl-text-3)" />
    <rect x="62" y="68" width="28" height="3" rx="1.5" fill="var(--stl-text-3)" />
    <rect x="62" y="75" width="32" height="3" rx="1.5" fill="var(--stl-text-3)" />
    <path d="M18 70c6-10 14-12 22-6" stroke="var(--stl-gold)" strokeWidth="2" strokeLinecap="round" />
    <path d="M38 66l4-2-1 4" stroke="var(--stl-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M120 40l2.5 6.5 6.5 2.5-6.5 2.5-2.5 6.5-2.5-6.5-6.5-2.5 6.5-2.5z" fill="var(--stl-gold)" opacity="0.9" />
  </svg>
);
