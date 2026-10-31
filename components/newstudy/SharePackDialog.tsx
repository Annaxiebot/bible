/**
 * SharePackDialog.tsx — 分享给组员 share a pack with members · 分享 (ADR-0026)
 *
 * One dialog per pack row: start sharing (mints the token on first use and
 * flips `shared` on), the member link as text + QR (SignupQr draws any URL)
 * + copy, and stop sharing (the link dies at once; the token is kept so a
 * re-share gives the same link). Sharing needs the pack synced to the
 * signed-in leader's account (owner-only RLS) — signed out, the dialog says
 * so and offers nothing else.
 */
import React, { useEffect, useState } from 'react';
import { StudyPack } from '../studypack/packTypes';
import { PackSharing, getPackSharing, setPackSharing, currentShareUrl } from '../studypack/packShare';
import { supabase, authManager } from '../../services/supabase';
import {
  NS_SHARE_TITLE, NS_SHARE_INTRO, NS_SHARE_ON, NS_SHARE_OFF, NS_SHARE_OFF_NOTE,
  NS_SHARE_COPY, NS_SHARE_COPIED, NS_SHARE_SIGNIN, NS_CLOSE,
} from './newStudyStrings';
import { textStyle, controlStyle, primaryButtonClass, secondaryButtonClass } from './newStudyStyles';
import SignupQr from '../signup/SignupQr';

interface Props {
  pack: StudyPack;
  onClose: () => void;
}

/** The live link block: QR + the URL + copy. */
const ShareLink: React.FC<{ token: string }> = ({ token }) => {
  const [copied, setCopied] = useState(false);
  const url = currentShareUrl(token);
  const copy = () => {
    void navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => {});
  };
  return (
    <div className="flex flex-col items-center gap-3" data-testid="share-link">
      <SignupQr url={url} size="200px" />
      <p className="break-all text-amber-200" style={textStyle} data-testid="share-url">{url}</p>
      <button type="button" onClick={copy} className={secondaryButtonClass} style={controlStyle} data-testid="share-copy">
        {copied ? NS_SHARE_COPIED : NS_SHARE_COPY}
      </button>
    </div>
  );
};

const SharePackDialog: React.FC<Props> = ({ pack, onClose }) => {
  const uid = authManager.getUserId();
  const ready = !!supabase && !!uid && pack.leaderId === uid;
  const [state, setState] = useState<PackSharing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    getPackSharing(supabase!, pack.id, uid!).then(setState).catch(err => setError((err as Error).message));
  }, [ready, pack.id, uid]);

  const toggle = (on: boolean) => {
    if (!ready || !state || busy) return;
    setBusy(true);
    setError(null);
    setPackSharing(supabase!, pack.id, uid!, on, state.shareToken)
      .then(setState)
      .catch(err => setError((err as Error).message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="share-dialog"
      role="dialog" aria-label={NS_SHARE_TITLE} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-stl-border bg-stl-surface p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-amber-300" style={controlStyle}>{NS_SHARE_TITLE}</h3>
        <p className="text-slate-300" style={textStyle}>{NS_SHARE_INTRO}</p>
        {!ready && <p className="text-amber-200" style={textStyle} data-testid="share-signin">{NS_SHARE_SIGNIN}</p>}
        {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
        {ready && state && (state.shared && state.shareToken ? (
          <>
            <ShareLink token={state.shareToken} />
            <p className="text-slate-500" style={textStyle}>{NS_SHARE_OFF_NOTE}</p>
            <button type="button" disabled={busy} onClick={() => toggle(false)}
              className={secondaryButtonClass} style={controlStyle} data-testid="share-off">{NS_SHARE_OFF}</button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => toggle(true)}
            className={primaryButtonClass} style={controlStyle} data-testid="share-on">{NS_SHARE_ON}</button>
        ))}
        <button type="button" onClick={onClose} className={secondaryButtonClass} style={controlStyle}
          data-testid="share-close">{NS_CLOSE}</button>
      </div>
    </div>
  );
};

export default SharePackDialog;
