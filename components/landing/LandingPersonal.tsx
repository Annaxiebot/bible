/**
 * LandingPersonal.tsx — "个人研经 Personal study" · 个人研经
 *
 * A giant faint 活出 watermark behind the section (decorative), the three
 * numbered points (/01 /02 /03), the "进入应用 Open the app" pill (#app),
 * and a side-by-side card that shows what the bilingual Bible looks like:
 * Matthew 6:34 in 和合本 and BSB, loaded from the bundled data.
 */
import React from 'react';
import { APP_HASH } from './landingRoute';
import {
  PERSONAL_SECTION_ID, PERSONAL_EYEBROW, PERSONAL_TITLE_ZH, PERSONAL_TITLE_EN, PERSONAL_POINTS,
  PERSONAL_CTA, PERSONAL_VERSE_REF, PERSONAL_VERSE_NOTE, BRAND_ZH_LEAD,
} from './landingStrings';
import { TRANSLATIONS } from '../studypack/principles';
import LandingSection from './LandingSection';
import LandingPill from './LandingPill';
import { useBundledVerse, BilingualRef } from './LandingVerse';

const ParallelVerse: React.FC = () => {
  const verse = useBundledVerse(PERSONAL_VERSE_REF.zh);
  return (
    <figure className="ld-parallel" data-testid="personal-verse">
      <div className="ld-ref"><BilingualRef refs={PERSONAL_VERSE_REF} /></div>
      <div className="ld-parallel-cols">
        <div><div className="ld-ver">{TRANSLATIONS.zh.label}</div><p className="ld-cuv">{verse?.cuv}</p></div>
        <div><div className="ld-ver">{TRANSLATIONS.en.label}</div><p className="ld-bsb" lang="en">{verse?.en}</p></div>
      </div>
      <figcaption className="ld-note-tag">{PERSONAL_VERSE_NOTE}</figcaption>
    </figure>
  );
};

const LandingPersonal: React.FC = () => (
  <LandingSection
    id={PERSONAL_SECTION_ID} eyebrow={PERSONAL_EYEBROW} className="ld-personal"
    headingZh={PERSONAL_TITLE_ZH} headingEn={PERSONAL_TITLE_EN}
  >
    <div className="ld-watermark" aria-hidden="true">{BRAND_ZH_LEAD}</div>
    <div className="ld-personal-grid">
      <div>
        <ul className="ld-points" data-testid="personal-points">
          {PERSONAL_POINTS.map((point, i) => (
            <li key={point.en}>
              <span className="ld-idx" aria-hidden="true">/{String(i + 1).padStart(2, '0')}</span>
              <span><span className="ld-point-zh">{point.zh}</span><span className="ld-en">{point.en}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-9"><LandingPill href={APP_HASH} label={PERSONAL_CTA} arrow testId="personal-open" /></p>
      </div>
      <ParallelVerse />
    </div>
  </LandingSection>
);

export default LandingPersonal;
