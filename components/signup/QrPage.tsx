/**
 * QrPage.tsx — "#/qr/<packId>": the sign-up QR to show or print · 报名二维码页
 *
 * Reached from 报名二维码 Sign-up QR on the leader home. The pack loads the
 * way the sign-up page loads it (useSignupPack, signed in or not); the page
 * shows its title + passage, a LARGE SignupQr encoding the same sign-up URL
 * the TV qr slide encodes (signupRoute.currentSignupUrl), that URL as text,
 * the SU_QR_BODY line and a 打印 Print button. Print CSS (Tailwind `print:`)
 * keeps only the title, QR and URL, on white. A pack with no owning leader
 * shows the TV slide's notice (NoSignupNotice) instead of a QR that cannot
 * work. Back link → #/leader.
 */
import React from 'react';
import SignupQr from './SignupQr';
import NoSignupNotice from './NoSignupNotice';
import { useSignupPack, SignupPackState } from './useSignupPack';
import { currentSignupUrl } from './signupRoute';
import { LEADER_HOME_HASH } from '../leader/leaderRoute';
import { SU_QR_BODY, SU_QR_PRINT, SU_QR_BACK, SU_ERR_PACK, SU_PACK_LOADING } from './signupStrings';
import { textStyle, headingStyle, controlStyle } from '../newstudy/newStudyStyles';

/** Large on a screen across the room, still fits a phone (the SVG scales to fill it). */
const QR_SIZE = 'min(60vh, 85vw)';
const titleStyle: React.CSSProperties = { fontSize: 'clamp(2rem, 1.5rem + 2vw, 3rem)', lineHeight: 1.25 };

const QrBody: React.FC<{ state: SignupPackState }> = ({ state }) => {
  if (state.status === 'loading') return <p className="text-stl-text-2" style={textStyle}>{SU_PACK_LOADING}</p>;
  if (state.status === 'failed') {
    return <p role="alert" className="text-red-300" style={textStyle}>{SU_ERR_PACK}: {state.message}</p>;
  }
  const { pack } = state;
  if (!pack.leaderId) return <NoSignupNotice pack={pack} lineStyle={headingStyle} buttonStyle={controlStyle} />;
  const url = currentSignupUrl(pack.id);
  return (
    <>
      <SignupQr url={url} size={QR_SIZE} />
      <p data-testid="qr-url" className="break-all font-semibold text-stl-gold print:text-black" style={headingStyle}>{url}</p>
      <p className="text-stl-text print:hidden" style={headingStyle}>{SU_QR_BODY}</p>
      <button type="button" data-testid="qr-print" onClick={() => window.print()}
        className="rounded-lg bg-stl-gold px-8 font-semibold text-stl-bg hover:bg-stl-gold-hover print:hidden" style={controlStyle}>
        {SU_QR_PRINT}
      </button>
    </>
  );
};

const QrPage: React.FC<{ packId: string }> = ({ packId }) => {
  const state = useSignupPack(packId);
  const pack = state.status === 'ready' ? state.pack : null;
  return (
    <div data-testid="qr-page"
      className="fixed inset-0 overflow-y-auto bg-stl-bg text-stl-text print:static print:min-h-screen print:overflow-visible print:bg-white print:text-black">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-8 text-center sm:px-6">
        <a href={LEADER_HOME_HASH} data-testid="qr-back"
          className="self-start text-stl-text-2 underline underline-offset-4 hover:text-stl-gold-hover print:hidden" style={controlStyle}>
          ← {SU_QR_BACK}
        </a>
        {pack && (
          <header data-testid="qr-pack">
            <h1 className="font-bold text-stl-text print:text-black" style={titleStyle}>{pack.title}</h1>
            <p className="mt-2 text-stl-gold print:text-black" style={headingStyle}>{pack.passageRef}</p>
          </header>
        )}
        <QrBody state={state} />
      </div>
    </div>
  );
};

export default QrPage;
