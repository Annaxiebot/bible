/**
 * LandingCards.tsx — the two door cards · 兩扇門
 *
 * Group study → sample pack (TV mode); personal study → the app. Each card
 * has an illustration, icon bullets and a ≥56px CTA. Hover/focus lift and
 * amber glow live in landing.css.
 */
import React from 'react';
import { APP_HASH, SAMPLE_PACK_HASH } from './landingRoute';
import {
  GROUP_TITLE_ZH, GROUP_TITLE_EN, GROUP_CTA, GROUP_POINTS,
  PERSONAL_TITLE_ZH, PERSONAL_TITLE_EN, PERSONAL_CTA, PERSONAL_POINTS,
  PointIcon, NavSectionId, GROUP_SECTION_ID, PERSONAL_SECTION_ID,
} from './landingStrings';
import { PointIconGlyph, ArrowIcon } from './landingIcons';
import { TvIllustration, PhoneIllustration } from './landingIllustrations';

interface Point {
  readonly icon: PointIcon;
  readonly zh: string;
  readonly en: string;
}

interface DoorCardProps {
  titleZh: string;
  titleEn: string;
  points: readonly Point[];
  ctaLabel: string;
  ctaHash: string;
  art: React.ReactNode;
  testId: string;
  /** Scroll target id for the sticky nav (NAV_LINKS). */
  id: NavSectionId;
}

const DoorCard: React.FC<DoorCardProps> = ({
  titleZh, titleEn, points, ctaLabel, ctaHash, art, testId, id,
}) => (
  <section
    id={id}
    data-testid={testId}
    className="ld-card flex flex-col rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-7"
  >
    <div className="flex justify-center">{art}</div>
    <h2 className="ld-card-title mt-4 font-semibold text-slate-100">
      <span className="font-serif-sc text-amber-400">{titleZh}</span>{' '}
      <span className="text-slate-100">{titleEn}</span>
    </h2>
    <ul className="mt-5 flex-1 space-y-4">
      {points.map(point => (
        <li key={point.en} className="flex gap-3">
          <span className="mt-1 shrink-0 text-amber-400/90"><PointIconGlyph name={point.icon} /></span>
          <span className="ld-body">
            <span className="block font-serif-sc text-slate-100">{point.zh}</span>
            <span className="block text-slate-400">{point.en}</span>
          </span>
        </li>
      ))}
    </ul>
    <a
      href={ctaHash}
      className="ld-cta mt-7 flex items-center justify-center gap-2 rounded-2xl
        bg-amber-500 px-6 font-semibold text-slate-950 hover:bg-amber-400"
    >
      <span>{ctaLabel}</span>
      <ArrowIcon />
    </a>
  </section>
);

const LandingCards: React.FC = () => (
  <div className="grid gap-6 sm:grid-cols-2">
    <DoorCard
      titleZh={GROUP_TITLE_ZH}
      titleEn={GROUP_TITLE_EN}
      points={GROUP_POINTS}
      ctaLabel={GROUP_CTA}
      ctaHash={SAMPLE_PACK_HASH}
      art={<TvIllustration />}
      testId="card-group"
      id={GROUP_SECTION_ID}
    />
    <DoorCard
      titleZh={PERSONAL_TITLE_ZH}
      titleEn={PERSONAL_TITLE_EN}
      points={PERSONAL_POINTS}
      ctaLabel={PERSONAL_CTA}
      ctaHash={APP_HASH}
      art={<PhoneIllustration />}
      testId="card-personal"
      id={PERSONAL_SECTION_ID}
    />
  </div>
);

export default LandingCards;
