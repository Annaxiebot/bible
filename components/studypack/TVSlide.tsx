/**
 * TVSlide.tsx — renders one StudyPack slide for the TV · 单页幻灯片
 *
 * Dark (colour tokens: styles/stlTheme.css), very large type (slideTypography.ts: vh-based on a
 * TV so it scales with the screen, width-based on a portrait phone).
 * Calm by design ("about the Word, not the graphics"): no images, one
 * heading style, quiet verse numbers and counters, gold only for headings
 * and the key phrase. How much text a slide carries is decided upstream
 * (slideFit.ts via buildSlides). Layout only; navigation lives in
 * useTVNavigation / TVPresentationView.
 * When the pack is provided, verse references in body lines become
 * interactive popups (ADR-0003 §8). Bilingual text is Chinese-first (§1).
 */
import React from 'react';
import { Slide, StudyPack } from './packTypes';
import { TRANSLATIONS, bilingual } from './principles';
import { useSlideTypography } from './slideTypography';
import RefLinkedText from './RefLinkedText';
import { HEADING_DETAIL_SEPARATOR, emphasisSegments, keyPhraseFragments, splitHeading } from './slideText';
import SignupQr from '../signup/SignupQr';
import UnclaimedSignIn from '../signup/UnclaimedSignIn';
import { SU_DEMO_LINE } from '../signup/signupStrings';
import { packSignupState } from './packSource';
import { isQuoteLine } from '../sharing/sharingStrings';

interface SlideProps {
  slide: Slide;
  pack?: StudyPack;
}

/** "n/m" when the section spans several slides, otherwise nothing. */
function partCounter(index?: number, total?: number): string | undefined {
  return index !== undefined && total !== undefined && total > 1 ? `${index}/${total}` : undefined;
}

/**
 * The one heading style: gold name at TYPE_SCALE.heading, then a smaller,
 * quieter tail: detail ("— 马太福音 6:25–34 Matthew") and counter ("· 2/3").
 * The text content stays "<heading> · n/m" for selection and Ask AI.
 */
const Heading: React.FC<{ text: string; counter?: string }> = ({ text, counter }) => {
  const t = useSlideTypography();
  const { main, detail } = splitHeading(text);
  return (
    <h1 className="font-bold text-stl-gold mb-[4vh]" style={t.heading}>
      {main}
      {(detail || counter) && (
        // The space before the tail is the break point; inline-block keeps the tail whole on a
        // narrow phone instead of splitting "马 / 太福音". Text stays "<main> — <detail> · n/m".
        <>{' '}<span className="inline-block font-normal" style={t.headingTail}>
          {detail && <span className="text-stl-text-2">{HEADING_DETAIL_SEPARATOR.trimStart()}{detail}</span>}
          {counter && <span className="text-stl-text-3">{detail ? ` · ${counter}` : `· ${counter}`}</span>}
        </span></>
      )}
    </h1>
  );
};

/** `quietQuotes` (sharing slides, ADR-0008): 「…」 lines — members' paraphrased words — in the quieter text colour. */
const BodyLines: React.FC<{ lines?: string[]; pack?: StudyPack; quietQuotes?: boolean }> = ({ lines, pack, quietQuotes }) => {
  const t = useSlideTypography();
  return (
    <div className="space-y-[2.5vh]">
      {(lines || []).map((line, i) => {
        const quiet = !!quietQuotes && isQuoteLine(line);
        return (
          <p key={i} className={quiet ? 'text-stl-text-2' : 'text-stl-text'} data-quote={quiet || undefined} style={t.body}>
            {pack ? <RefLinkedText text={line} pack={pack} /> : line}
          </p>
        );
      })}
    </div>
  );
};

const TitleSlide: React.FC<SlideProps> = ({ slide }) => {
  const t = useSlideTypography();
  return (
    <div className="flex flex-col items-center justify-center text-center h-full">
      <h1 className="font-bold text-stl-gold mb-[5vh]" style={t.title}>{slide.heading}</h1>
      <BodyLines lines={slide.body} />
    </div>
  );
};

/** Verse text with the key phrase (where it occurs) set in gold. */
const VerseText: React.FC<{ num: number; text: string; emphasis: string[] }> = ({ num, text, emphasis }) => {
  const t = useSlideTypography();
  return (
    <p className="text-stl-text" style={t.verse}>
      <span className="text-stl-text-3 mr-[0.35em]" style={t.verseNumber}>{num}</span>
      {emphasisSegments(text, emphasis).map((seg, i) => seg.emphasis
        ? <span key={i} data-testid="verse-emphasis" className="text-stl-gold">{seg.text}</span>
        : <React.Fragment key={i}>{seg.text}</React.Fragment>)}
    </p>
  );
};

/** Bilingual passage from the pack's embedded verses, split into parts. */
const ScriptureSlide: React.FC<SlideProps> = ({ slide, pack }) => {
  const t = useSlideTypography();
  const emphasis = keyPhraseFragments(slide.emphasis);
  return (
    <div className="h-full flex flex-col">
      <Heading text={slide.heading} counter={partCounter(slide.partIndex, slide.partTotal)} />
      {slide.keyPhrase && (
        <p data-testid="key-phrase" className="text-stl-gold font-semibold mb-[3.5vh]" style={t.keyPhrase}>{slide.keyPhrase}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-[4vw] text-stl-text-3 mb-[1.5vh]" style={t.columnLabel}>
        <span className="hidden md:block">{bilingual(TRANSLATIONS.zh.label, 'CUV')}</span>
        <span className="hidden md:block">{pack?.enVersion ?? TRANSLATIONS.en.label}</span>
        <span className="md:hidden">{`${bilingual(TRANSLATIONS.zh.label, 'CUV')} · ${pack?.enVersion ?? TRANSLATIONS.en.label}`}</span>
      </div>
      <div className="overflow-y-auto flex-1 space-y-[3vh]">
        {(slide.verses || []).map(v => (
          <div key={v.num} className="grid grid-cols-1 gap-[0.5vh] md:grid-cols-2 md:gap-[4vw]">
            <VerseText num={v.num} text={v.cuv} emphasis={emphasis} />
            <VerseText num={v.num} text={v.en} emphasis={emphasis} />
          </div>
        ))}
      </div>
    </div>
  );
};

const DiscussionSlide: React.FC<SlideProps> = ({ slide, pack }) => {
  const t = useSlideTypography();
  return (
    <div className="h-full flex flex-col">
      <Heading text={slide.heading} counter={partCounter(slide.questionNumber, slide.questionTotal)} />
      <div className="flex-1 flex items-center">
        <p className="text-stl-text font-semibold" style={t.question}>
          {pack && slide.question ? <RefLinkedText text={slide.question} pack={pack} /> : slide.question}
        </p>
      </div>
    </div>
  );
};

const LifeMenuSlide: React.FC<SlideProps> = ({ slide, pack }) => {
  const t = useSlideTypography();
  return (
  <div className="h-full flex flex-col">
    <Heading text={slide.heading} counter={partCounter(slide.partIndex, slide.partTotal)} />
    <table className="w-full border-collapse">
      <tbody>
        {(slide.rows || []).map((row, i) => (
          <tr key={i} className="block border-b border-stl-border md:table-row">
            <td className="block pt-[1vh] text-stl-gold font-semibold md:table-cell md:py-[1vh] md:pr-[2vw] md:whitespace-nowrap md:align-top" style={t.lifeMenu}>
              {row.area}
            </td>
            <td className="block pb-[1vh] text-stl-text md:table-cell md:py-[1vh]" style={t.lifeMenu}>
              {pack ? <RefLinkedText text={row.practice} pack={pack} /> : row.practice}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  );
};

/** Without a sign-up URL: a local pack asks its leader to sign in (claims it); a public pack is a demo. */
const NoSignup: React.FC<{ pack?: StudyPack }> = ({ pack }) => {
  const t = useSlideTypography();
  if (pack && packSignupState(pack) === 'unclaimed') {
    return <UnclaimedSignIn packId={pack.id} lineStyle={t.body} buttonStyle={t.body} />;
  }
  return <p data-testid="qr-demo" className="text-stl-text" style={t.body}>{SU_DEMO_LINE}</p>;
};

/**
 * QR sign-up slide: the pack's own sign-up URL drawn as a large centered
 * code (SignupQr renders it on a white quiet zone), the URL printed under it
 * for people who prefer typing, plus the one-line instruction. A pack with
 * no owning leader (no signupUrl) shows the sign-in block or the demo line.
 */
const QrSlide: React.FC<SlideProps> = ({ slide, pack }) => {
  const t = useSlideTypography();
  return (
  <div className="h-full flex flex-col items-center justify-center text-center">
    <Heading text={slide.headingZh ? `${slide.heading} ${slide.headingZh}` : slide.heading} />
    {slide.signupUrl ? (
      <>
        <SignupQr url={slide.signupUrl} size="46vh" className="mb-[3vh]" pack={pack} />
        <p className="text-stl-gold font-semibold mb-[2vh] break-all" style={t.body}>{slide.signupUrl}</p>
        <BodyLines lines={slide.body} />
      </>
    ) : (
      <NoSignup pack={pack} />
    )}
  </div>
  );
};

const TVSlide: React.FC<SlideProps> = ({ slide, pack }) => {
  if (slide.kind === 'title') return <TitleSlide slide={slide} />;
  if (slide.kind === 'scripture') return <ScriptureSlide slide={slide} pack={pack} />;
  if (slide.kind === 'discussion') return <DiscussionSlide slide={slide} pack={pack} />;
  if (slide.kind === 'lifeMenu') return <LifeMenuSlide slide={slide} pack={pack} />;
  if (slide.kind === 'qr') return <QrSlide slide={slide} pack={pack} />;
  return (
    <div className="h-full flex flex-col">
      <Heading text={slide.heading} counter={partCounter(slide.partIndex, slide.partTotal)} />
      <div className="overflow-y-auto flex-1">
        <BodyLines lines={slide.body} pack={pack} quietQuotes={slide.kind === 'sharing'} />
      </div>
    </div>
  );
};

export default TVSlide;
