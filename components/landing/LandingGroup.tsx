/**
 * LandingGroup.tsx — "小组查经 Group study: how a Friday works" · 小组查经
 *
 * The dark band: the leader line (bring your study guide → a TV deck),
 * three photo cards with a dark gradient and captions (Friday evening ·
 * on the TV · mid-week check-ins), then the sample-pack pill and a QR
 * sign-up button that scrolls to the next-study block (where the pack's
 * sign-up QR lives). Photos are local WebP (public/landing/, Unsplash
 * License, credited in the footer); the first loads eagerly, the rest lazily.
 */
import React from 'react';
import { SAMPLE_PACK_HASH } from './landingRoute';
import {
  GROUP_SECTION_ID, NEXT_SECTION_ID, GROUP_EYEBROW, GROUP_TITLE_ZH, GROUP_HEADING_EN, GROUP_PHOTOS,
  GROUP_CTA, GROUP_QR_CTA, LEADER_ZH, LEADER_EN,
} from './landingStrings';
import LandingSection, { Bilingual } from './LandingSection';
import Pill from '../shared/Pill';
import { scrollToSection } from './LandingNav';

/** Public URL of a landing photo under the app's base path. */
export const photoSrc = (file: string): string => `${import.meta.env.BASE_URL}landing/${file}`;

const LeaderLine: React.FC = () => (
  <p className="ld-lede" data-testid="leader-line"><Bilingual zh={LEADER_ZH} en={LEADER_EN} /></p>
);

const LandingGroup: React.FC = () => (
  <LandingSection
    id={GROUP_SECTION_ID} tone="dark" eyebrow={GROUP_EYEBROW}
    headingZh={GROUP_TITLE_ZH} headingEn={GROUP_HEADING_EN} description={<LeaderLine />}
  >
    <div className="ld-photo-grid" data-testid="group-photos">
      {GROUP_PHOTOS.map((photo, i) => (
        <figure key={photo.file} className="ld-photo">
          <img src={photoSrc(photo.file)} width={photo.width} height={photo.height} alt={photo.alt}
            loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
          <figcaption>
            <span className="ld-when">{photo.when}</span>
            <span className="ld-cap-zh">{photo.caption.zh}</span>
            <span className="ld-cap-en">{photo.caption.en}</span>
          </figcaption>
        </figure>
      ))}
    </div>
    <div className="ld-band-foot">
      <Pill href={SAMPLE_PACK_HASH} label={GROUP_CTA} arrow testId="group-sample" />
      <Pill ghost label={GROUP_QR_CTA} onClick={() => scrollToSection(NEXT_SECTION_ID)} testId="group-qr" />
    </div>
  </LandingSection>
);

export default LandingGroup;
