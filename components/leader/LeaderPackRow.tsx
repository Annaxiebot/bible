/**
 * LeaderPackRow.tsx — one pack on the leader home · 带领者主页的一行
 *
 * One compact row: the title, a grey line (date, passage when the title
 * lacks it, "报名 N 人" then "分享 M 条" — a gold-filled badge when M > 0, so
 * new sharing catches the leader's eye; quiet grey at 0), and four links — 放映 Present
 * (#/pack/<id>) the one gold button; 报名与反馈 Sign-ups & responses
 * (#/leader/<id>), 编辑 Edit (#/new/<id>) and 二维码 QR (#/qr/<id>, the
 * printable code) as quiet text links. Plain hash links,
 * so each target survives reload and the browser's back button returns here.
 * Present also asks for full screen inside its click (the user gesture).
 */
import React from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { newStudyHash, packHash } from '../landing/landingRoute';
import { qrHash } from '../signup/signupRoute';
import { leaderHash } from './leaderRoute';
import type { PackCounts } from './leaderHomeData';
import { NS_EDIT } from '../newstudy/newStudyStrings';
import { LH_PRESENT, LH_RESPONSES, LH_QR, signupCountLine, sharedCountLine } from './leaderStrings';
import { textStyle, controlStyle } from '../newstudy/newStudyStyles';
import { requestFullscreen } from '../studypack/fullscreen';
import { DateTile, StudyHeading, studyRowClass, goldButtonClass, outlineButtonClass, quietRowLinkClass } from '../shared/PackRowParts';


/** Shared answers waiting: a high-contrast gold badge (dark text on gold fill). */
const sharedBadgeClass = 'inline-block whitespace-nowrap rounded-full bg-stl-gold px-3 font-semibold text-stl-bg';

/** "报名 N 人" then "分享 M 条": the shared part a gold badge when M > 0, quiet when 0. Text = packCountsLine. */
const Counts: React.FC<{ counts: PackCounts }> = ({ counts }) => (
  <span data-testid="lh-counts">
    <span className="text-stl-text">{signupCountLine(counts.signups)}</span>{' '}
    {counts.answers > 0
      ? <span data-testid="lh-shared" data-has-shared="true" className={sharedBadgeClass}>{sharedCountLine(counts.answers)}</span>
      : <span data-testid="lh-shared" data-has-shared="false">{sharedCountLine(0)}</span>}
  </span>
);

/** The one gold action (Present on a card, New study on the page). */
export const primaryLinkClass =
  'inline-flex items-center rounded-lg bg-stl-gold px-5 font-semibold text-stl-bg hover:bg-stl-gold-hover';

interface Props {
  pack: StudyPack;
  /** null while the counts load (or when they failed — the page shows that line once). */
  counts: PackCounts | null;
}

/** One compact row: title + a grey line (date, the passage when the title lacks it, the counts — shared as a badge);
 *  放映 Present the one gold action, the rest quiet links. The list around it is PackListing. */
export const LeaderPackRow: React.FC<Props> = ({ pack, counts }) => (
  <li data-testid="lh-pack" className={studyRowClass}>
    <DateTile date={pack.date} />
    <StudyHeading pack={pack}>{counts && <Counts counts={counts} />}</StudyHeading>
    <div className="flex flex-wrap items-center gap-2">
      <a href={packHash(pack.id)} data-testid="lh-present" className={goldButtonClass} style={controlStyle}
        onClick={() => requestFullscreen()}>{LH_PRESENT}</a>
      <a href={leaderHash(pack.id)} data-testid="lh-responses" className={outlineButtonClass} style={controlStyle}>{LH_RESPONSES}</a>
      <a href={newStudyHash(pack.id)} data-testid="lh-edit" className={quietRowLinkClass} style={controlStyle}>{NS_EDIT}</a>
      <a href={qrHash(pack.id)} data-testid="lh-qr" className={quietRowLinkClass} style={controlStyle}>{LH_QR}</a>
    </div>
  </li>
);
