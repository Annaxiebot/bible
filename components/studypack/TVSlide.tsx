/**
 * TVSlide.tsx — renders one StudyPack slide for the TV · 单页幻灯片
 *
 * Dark, high-contrast, very large type (vh-based so it scales with the TV).
 * Layout only; navigation lives in useTVNavigation / TVPresentationView.
 */
import React from 'react';
import { Slide } from './packTypes';

const headingStyle: React.CSSProperties = { fontSize: '7vh', lineHeight: 1.2 };
const bodyStyle: React.CSSProperties = { fontSize: '5vh', lineHeight: 1.5 };
const subStyle: React.CSSProperties = { fontSize: '3.5vh', lineHeight: 1.4 };

const Heading: React.FC<{ text: string }> = ({ text }) => (
  <h1 className="font-bold text-amber-300 mb-[4vh]" style={headingStyle}>{text}</h1>
);

const BodyLines: React.FC<{ lines?: string[] }> = ({ lines }) => (
  <div className="space-y-[2.5vh]">
    {(lines || []).map((line, i) => (
      <p key={i} className="text-slate-100" style={bodyStyle}>{line}</p>
    ))}
  </div>
);

const TitleSlide: React.FC<{ slide: Slide }> = ({ slide }) => (
  <div className="flex flex-col items-center justify-center text-center h-full">
    <h1 className="font-bold text-amber-300 mb-[5vh]" style={{ fontSize: '9vh', lineHeight: 1.2 }}>
      {slide.heading}
    </h1>
    <BodyLines lines={slide.body} />
  </div>
);

/** Bilingual passage from the pack's embedded verses, split into parts. */
const ScriptureSlide: React.FC<{ slide: Slide }> = ({ slide }) => (
  <div className="h-full flex flex-col">
    <Heading text={`${slide.heading} · ${slide.partIndex}/${slide.partTotal}`} />
    {slide.keyPhrase && (
      <p className="text-white font-semibold mb-[3vh]" style={bodyStyle}>{slide.keyPhrase}</p>
    )}
    <div className="overflow-y-auto flex-1 space-y-[2.5vh]">
      {(slide.verses || []).map(v => (
        <div key={v.num} className="grid grid-cols-2 gap-[3vw]">
          <p className="text-slate-100" style={subStyle}>
            <span className="text-amber-400 mr-2">{v.num}</span>{v.cuv}
          </p>
          <p className="text-slate-100" style={subStyle}>
            <span className="text-amber-400 mr-2">{v.num}</span>{v.web}
          </p>
        </div>
      ))}
    </div>
  </div>
);

const DiscussionSlide: React.FC<{ slide: Slide }> = ({ slide }) => (
  <div className="h-full flex flex-col">
    <Heading text={`${slide.heading} · ${slide.questionNumber}/${slide.questionTotal}`} />
    <div className="flex-1 flex items-center">
      <p className="text-white font-semibold" style={{ fontSize: '6vh', lineHeight: 1.4 }}>
        {slide.question}
      </p>
    </div>
  </div>
);

const LifeMenuSlide: React.FC<{ slide: Slide }> = ({ slide }) => (
  <div className="h-full flex flex-col">
    <Heading text={slide.heading} />
    <table className="w-full border-collapse">
      <tbody>
        {(slide.rows || []).map((row, i) => (
          <tr key={i} className="border-b border-slate-700">
            <td className="text-amber-300 font-semibold py-[1vh] pr-[2vw] whitespace-nowrap align-top" style={subStyle}>
              {row.area}
            </td>
            <td className="text-slate-100 py-[1vh]" style={subStyle}>{row.practice}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * QR sign-up slide: large centered code on a white card (QR codes need a
 * light quiet zone to scan against the dark TV background), the URL printed
 * under it for people who prefer typing, plus the one-line instruction.
 */
const QrSlide: React.FC<{ slide: Slide }> = ({ slide }) => (
  <div className="h-full flex flex-col items-center justify-center text-center">
    <Heading text={slide.headingZh ? `${slide.heading} ${slide.headingZh}` : slide.heading} />
    <div className="bg-white rounded-xl p-[2vh] mb-[3vh]">
      <img
        src={`${import.meta.env.BASE_URL}${slide.image}`}
        alt={`QR code for ${slide.url}`}
        style={{ width: '50vh', height: '50vh' }}
      />
    </div>
    <p className="text-amber-300 font-semibold mb-[2vh]" style={bodyStyle}>{slide.url}</p>
    <BodyLines lines={slide.body} />
  </div>
);

const TVSlide: React.FC<{ slide: Slide }> = ({ slide }) => {
  if (slide.kind === 'title') return <TitleSlide slide={slide} />;
  if (slide.kind === 'scripture') return <ScriptureSlide slide={slide} />;
  if (slide.kind === 'discussion') return <DiscussionSlide slide={slide} />;
  if (slide.kind === 'lifeMenu') return <LifeMenuSlide slide={slide} />;
  if (slide.kind === 'qr') return <QrSlide slide={slide} />;
  return (
    <div className="h-full flex flex-col">
      <Heading text={slide.heading} />
      <div className="overflow-y-auto flex-1">
        <BodyLines lines={slide.body} />
      </div>
    </div>
  );
};

export default TVSlide;
