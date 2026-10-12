/**
 * AdminPage.tsx — "#/admin", the site owner's portal · 管理后台 (ADR-0023)
 *
 * Read-only v1. Who may see it is decided by the database, not here: the
 * page asks is_site_admin() for the signed-in caller and reads nothing else
 * unless the answer is true; signed out, not an admin, or refused by the
 * database (AD403) → "仅限管理员 · Admins only" and no data. For an admin:
 * "管理 · Admin", "仅限网站管理员 · Site owner only — <email>", and three
 * tabs — 带领者 Leaders (default), 意见反馈 Feedback (with a count badge),
 * 统计 Stats. Every failure renders inline (role=alert, R5). Nothing is
 * kept in the URL or browser storage; each visit reads fresh.
 */
import React, { useState } from 'react';
import { useLeaderSession } from '../leader/useLeaderSession';
import { LEADER_HOME_HASH } from '../leader/leaderRoute';
import { LD_BACK } from '../leader/leaderStrings';
import { SU_ERR_NOT_CONFIGURED } from '../signup/signupStrings';
import { textStyle, controlStyle, pageTitleStyle } from '../newstudy/newStudyStyles';
import { splitLabel } from '../studypack/principles';
import { useIsSiteAdmin, useAdminData, type AdminData } from './adminData';
import { AdminLeaders } from './AdminLeaders';
import { AdminFeedback } from './AdminFeedback';
import { AdminStats } from './AdminStats';
import {
  AD_TITLE, AD_DENIED, AD_CHECKING, AD_LOADING, AD_ERR_CHECK, AD_ERR_LOAD, AD_TAB_LEADERS, AD_TAB_FEEDBACK, AD_TAB_STATS,
  ownerOnlyLine,
} from './adminStrings';

export type AdminTab = 'leaders' | 'feedback' | 'stats';

const alert = (text: string) => <p role="alert" className="text-red-300" style={textStyle}>{text}</p>;
const quiet = (text: string) => <p className="text-stl-text-2" style={textStyle}>{text}</p>;
const denied = <p data-testid="admin-denied" className="font-semibold text-stl-text" style={textStyle}>{AD_DENIED}</p>;

/** Three equal tabs: Chinese on top, English smaller beneath (two short lines fit a phone, like the table headers). */
const tabClass = (active: boolean) =>
  `flex flex-col items-center justify-center border-b-2 px-2 py-1 ${active ? 'border-stl-gold font-semibold text-stl-gold' : 'border-transparent text-stl-text-2 hover:text-stl-text'}`;
const subLabelStyle: React.CSSProperties = { fontSize: Number(textStyle.fontSize) * 0.8, lineHeight: 1.3 };
const badgeClass = 'ml-2 inline-block rounded-full bg-stl-surface-2 px-2 text-stl-text';

const Tabs: React.FC<{ tab: AdminTab; onTab: (t: AdminTab) => void; feedbackCount: number }> = ({ tab, onTab, feedbackCount }) => {
  const item = (id: AdminTab, label: string, badge?: number) => {
    const { zh, en } = splitLabel(label);
    return (
      <button key={id} type="button" role="tab" aria-selected={tab === id} aria-label={label} data-testid={`admin-tab-${id}`}
        onClick={() => onTab(id)} className={tabClass(tab === id)} style={controlStyle}>
        <span className="whitespace-nowrap">
          {zh}
          {badge !== undefined && <span data-testid={`admin-tab-${id}-count`} className={badgeClass}>{badge}</span>}
        </span>
        <span className="font-normal" style={subLabelStyle}>{en}</span>
      </button>
    );
  };
  return (
    <div role="tablist" className="grid grid-cols-3 border-b border-stl-border sm:max-w-xl">
      {item('leaders', AD_TAB_LEADERS)}
      {item('feedback', AD_TAB_FEEDBACK, feedbackCount)}
      {item('stats', AD_TAB_STATS)}
    </div>
  );
};

const Portal: React.FC<{ data: AdminData }> = ({ data }) => {
  const [tab, setTab] = useState<AdminTab>('leaders');
  return (
    <>
      <Tabs tab={tab} onTab={setTab} feedbackCount={data.feedback.length} />
      <div role="tabpanel">
        {tab === 'leaders' && <AdminLeaders leaders={data.leaders} />}
        {tab === 'feedback' && <AdminFeedback rows={data.feedback} />}
        {tab === 'stats' && <AdminStats stats={data.stats} />}
      </div>
    </>
  );
};

/** Signed in and confirmed admin: read the three admin functions. */
const AdminBody: React.FC = () => {
  const state = useAdminData();
  if (state.status === 'loading') return quiet(AD_LOADING);
  if (state.status === 'denied') return denied;
  if (state.status === 'failed') return alert(`${AD_ERR_LOAD}: ${state.message}`);
  return <Portal data={state.data} />;
};

const AdminPage: React.FC = () => {
  const session = useLeaderSession();
  const check = useIsSiteAdmin(session.uid);
  const signedOut = session.configured && !session.loading && !session.uid;
  return (
    <div data-testid="admin-page" className="fixed inset-0 overflow-y-auto bg-stl-bg text-stl-text">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-bold text-stl-gold" style={pageTitleStyle}>{AD_TITLE}</h1>
            {check.status === 'yes' && <p data-testid="admin-owner-line" className="text-stl-text-2" style={textStyle}>{ownerOnlyLine(session.email)}</p>}
          </div>
          <a href={LEADER_HOME_HASH} className="rounded-lg px-4 text-stl-text-2 hover:text-stl-text" style={controlStyle} aria-label={LD_BACK}>✕</a>
        </header>
        {!session.configured && alert(SU_ERR_NOT_CONFIGURED)}
        {signedOut && denied}
        {session.uid && check.status === 'checking' && quiet(AD_CHECKING)}
        {session.uid && check.status === 'failed' && alert(`${AD_ERR_CHECK}: ${check.message}`)}
        {session.uid && check.status === 'no' && denied}
        {session.uid && check.status === 'yes' && <AdminBody />}
      </div>
    </div>
  );
};

export default AdminPage;
