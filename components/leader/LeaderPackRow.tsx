/**
 * LeaderPackRow.tsx — one pack on the leader home · 带领者主页的一行
 *
 * Title, passage · date, a "报名 N 人，分享 M 条" label and four links — 放映 Present the one gold button, 报名与反馈 outlined, 编辑 Edit and 二维码 quiet text links: 编辑 Edit
 * (#/new/<id>), 放映 Present (#/pack/<id>), 报名与反馈 Sign-ups & responses
 * (#/leader/<id>), 二维码 QR (#/qr/<id>, the printable code). Plain hash links,
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
import { LH_PRESENT, LH_RESPONSES, LH_QR, packCountsLine } from './leaderStrings';
import { textStyle, controlStyle } from '../newstudy/newStudyStyles';
import { requestFullscreen } from '../studypack/fullscreen';

/** The card title: 1.25× the body size (textStyle is a fixed px size, so em would not scale it). */
const titleStyle: React.CSSProperties = { ...textStyle, fontSize: Number(textStyle.fontSize) * 1.25, lineHeight: 1.3 };

/** The one gold action (Present on a card, New study on the page). */
export const primaryLinkClass =
  'inline-flex items-center rounded-lg bg-stl-gold px-5 font-semibold text-stl-bg hover:bg-stl-gold-hover';
/** A secondary action: outlined. */
const linkButtonClass =
  'inline-flex items-center rounded-lg border border-stl-border px-5 text-stl-text hover:border-stl-gold hover:text-stl-gold-hover';
/** A rarely used action: a quiet text link. */
const quietLinkClass = 'inline-flex items-center px-2 text-stl-text-2 underline underline-offset-4 hover:text-stl-text';

interface Props {
  pack: StudyPack;
  /** null while the counts load (or when they failed — the page shows that line once). */
  counts: PackCounts | null;
}

export const LeaderPackRow: React.FC<Props> = ({ pack, counts }) => (
  <li data-testid="lh-pack" className="flex flex-col gap-3 rounded-xl border border-stl-border bg-stl-surface p-5">
    <div className="flex flex-col gap-1">
      <span className="font-semibold text-stl-text" style={titleStyle}>{pack.title}</span>
      <span className="text-stl-text-2" style={textStyle}>{pack.passageRef} · {pack.date}</span>
    </div>
    {counts && (
      <span data-testid="lh-counts" className="self-start rounded-lg bg-stl-gold-dim px-3 py-1 text-stl-gold" style={textStyle}>
        {packCountsLine(counts.signups, counts.answers)}
      </span>
    )}
    <div className="flex flex-wrap items-center gap-2">
      <a href={packHash(pack.id)} data-testid="lh-present" className={primaryLinkClass} style={controlStyle}
        onClick={() => requestFullscreen()}>{LH_PRESENT}</a>
      <a href={leaderHash(pack.id)} data-testid="lh-responses" className={linkButtonClass} style={controlStyle}>{LH_RESPONSES}</a>
      <a href={newStudyHash(pack.id)} data-testid="lh-edit" className={quietLinkClass} style={controlStyle}>{NS_EDIT}</a>
      <a href={qrHash(pack.id)} data-testid="lh-qr" className={quietLinkClass} style={controlStyle}>{LH_QR}</a>
    </div>
  </li>
);
