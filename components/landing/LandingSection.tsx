/**
 * LandingSection.tsx — the shared "eyebrow → heading → lede" shell · 段落骨架
 *
 * Every section below the hero opens with the same rhythm: a mono
 * "// 中文 · ENGLISH" eyebrow, a big Chinese-first heading (霞鹜文楷) with its
 * English line under it, an optional bilingual lede, then the section's own
 * content. One component so the sections cannot drift (and the sticky nav's
 * scroll-margin lives on one class, .ld-band). `tone` picks the paper,
 * tinted or dark band.
 */
import React from 'react';

/** "中文 · English" → its two halves (a line with no separator stays whole). */
export function splitBilingual(line: string): { zh: string; en: string } {
  const at = line.indexOf(' · ');
  return at < 0 ? { zh: line, en: '' } : { zh: line.slice(0, at), en: line.slice(at + 3) };
}

/** Chinese line, then the English line under it (ADR-0003 §1). */
export const Bilingual: React.FC<{ zh: string; en: string; zhClass?: string }> = ({ zh, en, zhClass }) => (
  <>
    <span className={zhClass ?? 'block'}>{zh}</span>
    {en && <span className="ld-en">{en}</span>}
  </>
);

interface LandingSectionProps {
  id: string;
  eyebrow: string;
  headingZh: string;
  headingEn: string;
  /** "中文 · English" lede, or a node when it needs markup / a test id. */
  description?: string | React.ReactNode;
  tone?: 'paper' | 'tint' | 'dark';
  className?: string;
  children: React.ReactNode;
}

const TONE_CLASS = { paper: '', tint: 'ld-next', dark: 'ld-dark' } as const;

const Lede: React.FC<{ description: string | React.ReactNode }> = ({ description }) => {
  if (typeof description !== 'string') return <>{description}</>;
  const { zh, en } = splitBilingual(description);
  return <p className="ld-lede"><Bilingual zh={zh} en={en} /></p>;
};

const LandingSection: React.FC<LandingSectionProps> = ({
  id, eyebrow, headingZh, headingEn, description, tone = 'paper', className = '', children,
}) => (
  <section
    id={id}
    data-testid={`section-${id}`}
    aria-labelledby={`${id}-h`}
    className={`ld-band ${TONE_CLASS[tone]} ${className}`.trim()}
  >
    <div className="ld-wrap">
      <p className="ld-eyebrow">{eyebrow}</p>
      <h2 className="ld-h2" id={`${id}-h`}>
        {headingZh}<span className="ld-h2-en">{headingEn}</span>
      </h2>
      {description && <Lede description={description} />}
      {children}
    </div>
  </section>
);

export default LandingSection;
