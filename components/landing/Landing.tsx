/**
 * Landing.tsx — scripturetolife.org home page · 首頁
 *
 * Minimalist, mobile-first, dark (slate-950/amber, matching TV mode).
 * Shown only at the bare root URL; the two door-card CTAs set the hash
 * that LandingGate routes on. Pure static content — no data fetching.
 */
import React from 'react';
import { APP_HASH, SAMPLE_PACK_HASH } from './landingRoute';

const LOOP_LINE_EN = 'Understand the Word → Live the Word → Flourish';
const LOOP_LINE_ZH = '明白神的話 → 活出神的話 → 生命興盛';

const Hero: React.FC = () => (
  <header className="pt-16 pb-10 text-center sm:pt-24">
    <h1 className="text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
      Scripture to Life
    </h1>
    <p className="mt-2 font-serif-sc text-2xl text-amber-400 sm:text-3xl">
      活出神的話
    </p>
    <p className="mt-6 text-base font-medium text-slate-200 sm:text-lg">
      {LOOP_LINE_EN}
    </p>
    <p className="mt-1 font-serif-sc text-sm text-slate-400 sm:text-base">
      {LOOP_LINE_ZH}
    </p>
    <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-slate-400 sm:text-base">
      AI-powered Bible study that doesn&rsquo;t stop at understanding
      &mdash; it follows you into the week.
    </p>
  </header>
);

interface DoorCardProps {
  title: string;
  titleZh: string;
  points: string[];
  ctaLabel: string;
  ctaHash: string;
}

const DoorCard: React.FC<DoorCardProps> = ({ title, titleZh, points, ctaLabel, ctaHash }) => (
  <section className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
    <h2 className="text-xl font-semibold text-slate-100">
      {title} <span className="font-serif-sc text-amber-400/90">{titleZh}</span>
    </h2>
    <ul className="mt-4 flex-1 space-y-2">
      {points.map(point => (
        <li key={point} className="flex gap-2 text-sm leading-relaxed text-slate-400">
          <span aria-hidden="true" className="text-amber-500/70">&middot;</span>
          <span>{point}</span>
        </li>
      ))}
    </ul>
    <a
      href={ctaHash}
      className="mt-6 flex min-h-[44px] items-center justify-center rounded-xl
        bg-amber-500 px-6 text-base font-semibold text-slate-950
        transition-colors hover:bg-amber-400 active:bg-amber-400"
    >
      {ctaLabel}
    </a>
  </section>
);

const LeaderLine: React.FC = () => (
  <p className="mx-auto mt-10 max-w-lg text-center text-sm leading-relaxed text-slate-500">
    <span className="font-medium text-slate-400">Group leaders:</span>{' '}
    bring your study guide PDF &mdash; it becomes a presentation with an AI helper.
    <br />
    <span className="font-serif-sc">組長：上傳查經講義，變成大屏簡報。</span>
  </p>
);

const Footer: React.FC = () => (
  <footer className="mt-14 border-t border-slate-800/80 pb-10 pt-6 text-center">
    <p className="text-xs text-slate-500">
      Scripture to Life &middot; scripturetolife.org
    </p>
    <p className="mt-1 text-xs text-slate-600">
      {LOOP_LINE_EN} <span className="font-serif-sc">&middot; {LOOP_LINE_ZH}</span>
    </p>
  </footer>
);

const Landing: React.FC = () => (
  <div
    data-testid="landing-page"
    className="fixed inset-0 overflow-y-auto bg-slate-950 text-slate-100"
  >
    <div className="mx-auto max-w-3xl px-4 sm:px-6">
      <Hero />
      <div className="grid gap-5 sm:grid-cols-2">
        <DoorCard
          title="Group Bible Study"
          titleZh="小組查經"
          points={[
            'Your study guide becomes a TV-ready deck',
            'Discussion questions, one per slide',
            'QR sign-up for the group',
            'Mid-week check-ins that keep the Word in the week',
          ]}
          ctaLabel="See a sample pack 看示範"
          ctaHash={SAMPLE_PACK_HASH}
        />
        <DoorCard
          title="Personal Study"
          titleZh="個人研經"
          points={[
            'Bilingual Bible 和合本 | WEB, side by side',
            'Handwriting notes, built for iPad and Pencil',
            'AI research on any verse or word',
          ]}
          ctaLabel="Open the app 進入應用"
          ctaHash={APP_HASH}
        />
      </div>
      <LeaderLine />
      <Footer />
    </div>
  </div>
);

export default Landing;
