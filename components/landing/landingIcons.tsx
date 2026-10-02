/**
 * landingIcons.tsx — hand-drawn inline SVG icons for the landing · 首頁圖標
 *
 * 24×24 stroke icons in the amber/slate palette. No icon library, no raster.
 */
import React from 'react';
import type { PointIcon } from './landingStrings';

const ICON_PROPS = {
  width: 28,
  height: 28,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const DeckIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4M7 9h6M7 12h10" />
  </svg>
);

const QuestionIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5M12 17h.01" />
  </svg>
);

const QrIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2" />
  </svg>
);

const CheckinIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" />
  </svg>
);

const BibleIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 19a2 2 0 0 1 2-2h13M11 7v6M8.5 9.5h5" />
  </svg>
);

const PencilIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <path d="M4 20l4-1 10-10a2 2 0 0 0-3-3L5 16z" />
    <path d="M13 8l3 3" />
  </svg>
);

const SparkleIcon: React.FC = () => (
  <svg {...ICON_PROPS}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
  </svg>
);

const ICONS: Record<PointIcon, React.FC> = {
  deck: DeckIcon,
  question: QuestionIcon,
  qr: QrIcon,
  checkin: CheckinIcon,
  bible: BibleIcon,
  pencil: PencilIcon,
  sparkle: SparkleIcon,
};

/** Icon beside a card bullet, by name. */
export const PointIconGlyph: React.FC<{ name: PointIcon }> = ({ name }) => {
  const Glyph = ICONS[name];
  return <Glyph />;
};

/** Arrow inside the CTA buttons; nudges right on hover. */
export const ArrowIcon: React.FC = () => (
  <svg {...ICON_PROPS} width={24} height={24} className="ld-cta-icon" strokeWidth={2.25}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
