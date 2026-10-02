/**
 * LandingSection.tsx — the shared "eyebrow → heading → one line" shell · 段落骨架
 *
 * Every section below the door cards opens with the same rhythm: a small
 * amber eyebrow label, a big Chinese-first heading, one bilingual line, then
 * the section's own content. One component so the three sections cannot
 * drift (and the sticky nav's scroll-margin lives on one element).
 */
import React from 'react';

interface LandingSectionProps {
  id: string;
  eyebrow: string;
  headingZh: string;
  headingEn: string;
  description: string;
  children: React.ReactNode;
}

const LandingSection: React.FC<LandingSectionProps> = ({
  id, eyebrow, headingZh, headingEn, description, children,
}) => (
  <section id={id} data-testid={`section-${id}`} className="ld-section mt-20 text-center">
    <p className="ld-eyebrow font-semibold uppercase tracking-widest text-amber-400">{eyebrow}</p>
    <h2 className="ld-card-title mt-3 font-semibold text-slate-100">
      <span className="block font-serif-sc">{headingZh}</span>
      <span className="block text-slate-300">{headingEn}</span>
    </h2>
    <p className="ld-body mx-auto mt-3 max-w-2xl text-slate-400">{description}</p>
    <div className="mt-8">{children}</div>
  </section>
);

export default LandingSection;
