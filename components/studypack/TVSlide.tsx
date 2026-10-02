/**
 * TVSlide.tsx — renders one StudyPack slide for the TV · 单页幻灯片
 *
 * Dark, high-contrast, very large type (vh-based so it scales with the TV).
 * Layout only; navigation lives in useTVNavigation / TVPresentationView.
 * When the pack is provided, verse references in body lines become
 * interactive popups (ADR-0003 §8). Bilingual text is Chinese-first (§1).
 */
import React from 'react';
import { Slide, StudyPack } from './packTypes';
import { TRANSLATIONS, TYPE_SCALE, bilingual } from './principles';
import RefLinkedText from './RefLinkedText';
import SignupQr from '../signup/SignupQr';
import { SU_DEMO_LINE } from '../signup/signupStrings';

// TYPE_SCALE (principles.ts): senior-readable floors on TV, px floors on phones.
const headingStyle: React.CSSProperties = { fontSize: TYPE_SCALE.heading, lineHeight: 1.2 };
const bodyStyle: React.CSSProperties = { fontSize: TYPE_SCALE.body, lineHeight: 1.5 };
const verseStyle: React.CSSProperties = { fontSize: TYPE_SCALE.verse, lineHeight: 1.4 };
const lifeMenuStyle: React.CSSProperties = { fontSize: TYPE_SCALE.lifeMenuRow, lineHeight: 1.4 };

interface SlideProps {
  slide: Slide;
  pack?: StudyPack;
}

const Heading: React.FC<{ text: string }> = ({ text }) => (
  <h1 className="font-bold text-amber-300 mb-[4vh]" style={headingStyle}>{text}</h1>
);

const BodyLines: React.FC<{ lines?: string[]; pack?: StudyPack }> = ({ lines, pack }) => (
  <div className="space-y-[2.5vh]">
    {(lines || []).map((line, i) => (
      <p key={i} className="text-slate-100" style={bodyStyle}>
        {pack ? <RefLinkedText text={line} pack={pack} /> : line}
      </p>
    ))}
  </div>
);

const TitleSlide: React.FC<SlideProps> = ({ slide }) => (
  <div className="flex flex-col items-center justify-center text-center h-full">
    <h1 className="font-bold text-amber-300 mb-[5vh]" style={{ fontSize: 'max(22px, 9vh)', lineHeight: 1.2 }}>
      {slide.heading}
    </h1>
    <BodyLines lines={slide.body} />
  </div>
);

/** Bilingual passage from the pack's embedded verses, split into parts. */
const ScriptureSlide: React.FC<SlideProps> = ({ slide, pack }) => (
  <div className="h-full flex flex-col">
    <Heading text={`${slide.heading} · ${slide.partIndex}/${slide.partTotal}`} />
    {slide.keyPhrase && (
      <p className="text-white font-semibold mb-[3vh]" style={bodyStyle}>{slide.keyPhrase}</p>
    )}
    <div className="grid grid-cols-1 md:grid-cols-2 md:gap-[3vw] text-slate-400 mb-[1.5vh]" style={verseStyle}>
      <span className="hidden md:block">{bilingual(TRANSLATIONS.zh.label, 'CUV')}</span>
      <span className="hidden md:block">{pack?.enVersion ?? TRANSLATIONS.en.label}</span>
      <span className="md:hidden">{`${bilingual(TRANSLATIONS.zh.label, 'CUV')} · ${pack?.enVersion ?? TRANSLATIONS.en.label}`}</span>
    </div>
    <div className="overflow-y-auto flex-1 space-y-[2.5vh]">
      {(slide.verses || []).map(v => (
        <div key={v.num} className="grid grid-cols-1 gap-[0.5vh] md:grid-cols-2 md:gap-[3vw]">
          <p className="text-slate-100" style={verseStyle}>
            <span className="text-amber-400 mr-2">{v.num}</span>{v.cuv}
          </p>
          <p className="text-slate-100" style={verseStyle}>
            <span className="text-amber-400 mr-2">{v.num}</span>{v.en}
          </p>
        </div>
      ))}
    </div>
  </div>
);

const DiscussionSlide: React.FC<SlideProps> = ({ slide, pack }) => (
  <div className="h-full flex flex-col">
    <Heading text={`${slide.heading} · ${slide.questionNumber}/${slide.questionTotal}`} />
    <div className="flex-1 flex items-center">
      <p className="text-white font-semibold" style={{ fontSize: TYPE_SCALE.question, lineHeight: 1.4 }}>
        {pack && slide.question ? <RefLinkedText text={slide.question} pack={pack} /> : slide.question}
      </p>
    </div>
  </div>
);

const LifeMenuSlide: React.FC<SlideProps> = ({ slide, pack }) => (
  <div className="h-full flex flex-col">
    <Heading text={slide.heading} />
    <table className="w-full border-collapse">
      <tbody>
        {(slide.rows || []).map((row, i) => (
          <tr key={i} className="block border-b border-slate-700 md:table-row">
            <td className="block pt-[1vh] text-amber-300 font-semibold md:table-cell md:py-[1vh] md:pr-[2vw] md:whitespace-nowrap md:align-top" style={lifeMenuStyle}>
              {row.area}
            </td>
            <td className="block pb-[1vh] text-slate-100 md:table-cell md:py-[1vh]" style={lifeMenuStyle}>
              {pack ? <RefLinkedText text={row.practice} pack={pack} /> : row.practice}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * QR sign-up slide: the pack's own sign-up URL drawn as a large centered
 * code (SignupQr renders it on a white quiet zone), the URL printed under it
 * for people who prefer typing, plus the one-line instruction. A pack with
 * no owning leader (no signupUrl) shows the demo line instead.
 */
const QrSlide: React.FC<SlideProps> = ({ slide, pack }) => (
  <div className="h-full flex flex-col items-center justify-center text-center">
    <Heading text={slide.headingZh ? `${slide.heading} ${slide.headingZh}` : slide.heading} />
    {slide.signupUrl ? (
      <>
        <SignupQr url={slide.signupUrl} size="54vh" className="mb-[3vh]" pack={pack} />
        <p className="text-amber-300 font-semibold mb-[2vh] break-all" style={bodyStyle}>{slide.signupUrl}</p>
        <BodyLines lines={slide.body} />
      </>
    ) : (
      <p data-testid="qr-demo" className="text-slate-300" style={bodyStyle}>{SU_DEMO_LINE}</p>
    )}
  </div>
);

const TVSlide: React.FC<SlideProps> = ({ slide, pack }) => {
  if (slide.kind === 'title') return <TitleSlide slide={slide} />;
  if (slide.kind === 'scripture') return <ScriptureSlide slide={slide} pack={pack} />;
  if (slide.kind === 'discussion') return <DiscussionSlide slide={slide} pack={pack} />;
  if (slide.kind === 'lifeMenu') return <LifeMenuSlide slide={slide} pack={pack} />;
  if (slide.kind === 'qr') return <QrSlide slide={slide} pack={pack} />;
  return (
    <div className="h-full flex flex-col">
      <Heading text={slide.heading} />
      <div className="overflow-y-auto flex-1">
        <BodyLines lines={slide.body} pack={pack} />
      </div>
    </div>
  );
};

export default TVSlide;
