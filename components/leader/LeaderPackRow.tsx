/**
 * LeaderPackRow.tsx — one pack on the leader home · 带领者主页的一行
 *
 * Title, passage · date, "报名 N 人，分享 M 条" and four links: 编辑 Edit
 * (#/new/<id>), 放映 Present (#/pack/<id>), 报名与反馈 Sign-ups & responses
 * (#/leader/<id>), 报名二维码 Sign-up QR (#/signup/<id>). Plain hash links,
 * so each target survives reload and the browser's back button returns here.
 */
import React from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { newStudyHash, packHash } from '../landing/landingRoute';
import { signupHash } from '../signup/signupRoute';
import { leaderHash } from './leaderRoute';
import type { PackCounts } from './leaderHomeData';
import { NS_EDIT } from '../newstudy/newStudyStrings';
import { LH_PRESENT, LH_RESPONSES, LH_QR, packCountsLine } from './leaderStrings';
import { textStyle, controlStyle } from '../newstudy/newStudyStyles';

export const linkButtonClass =
  'inline-flex items-center rounded-lg border border-stl-border px-5 text-stl-text hover:border-stl-gold hover:text-stl-gold-hover';

interface Props {
  pack: StudyPack;
  /** null while the counts load (or when they failed — the page shows that line once). */
  counts: PackCounts | null;
}

export const LeaderPackRow: React.FC<Props> = ({ pack, counts }) => {
  const links = [
    { href: newStudyHash(pack.id), label: NS_EDIT, testId: 'lh-edit' },
    { href: packHash(pack.id), label: LH_PRESENT, testId: 'lh-present' },
    { href: leaderHash(pack.id), label: LH_RESPONSES, testId: 'lh-responses' },
    { href: signupHash(pack.id), label: LH_QR, testId: 'lh-qr' },
  ];
  return (
    <li data-testid="lh-pack" className="flex flex-col gap-2 rounded-xl border border-stl-border bg-stl-surface p-4">
      <span className="font-semibold text-stl-text" style={textStyle}>{pack.title}</span>
      <span className="text-stl-text-2" style={textStyle}>{pack.passageRef} · {pack.date}</span>
      {counts && <span data-testid="lh-counts" className="text-stl-gold" style={textStyle}>{packCountsLine(counts.signups, counts.answers)}</span>}
      <div className="flex flex-wrap gap-2">
        {links.map(link => (
          <a key={link.testId} href={link.href} data-testid={link.testId} className={linkButtonClass} style={controlStyle}>
            {link.label}
          </a>
        ))}
      </div>
    </li>
  );
};
