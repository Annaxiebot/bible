/**
 * SignupQr.tsx — a QR code for a sign-up URL, drawn in the browser · 二维码
 *
 * One shared component for the TV qr slide and the landing's next-study
 * panel. Renders the `qrcode` package's SVG (no canvas, so jsdom tests and
 * the e2e decode check both work) on a white card — QR codes need a light
 * quiet zone against the dark pages. The encoded text is exposed as
 * data-signup-url so tests assert exactly what was encoded. A drawing
 * failure renders a bilingual alert instead of an empty box. Given the
 * pack, showing the QR also refreshes the owner's pack_summaries row (the
 * check-in sender's only copy of a local pack's text) and surfaces a failed
 * sync under the code.
 */
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { StudyPack } from '../studypack/packTypes';
import { qrAltText, SU_QR_FAILED } from './signupStrings';
import { QR_SVG_OPTIONS } from './signupRoute';
import { useSummarySync } from './useSummarySync';

interface Props {
  url: string;
  /** Edge length; the SVG scales to fill it. */
  size: string;
  className?: string;
  /** When given, showing the QR also refreshes the owner's pack_summaries row (ADR-0004). */
  pack?: StudyPack;
  /** Paper pages (landing, #/qr) need a dark error red; the dark TV slide keeps the light one. */
  tone?: 'dark' | 'paper';
}

type QrState = { status: 'drawing' } | { status: 'ready'; svg: string } | { status: 'failed'; message: string };

const SignupQr: React.FC<Props> = ({ url, size, className, pack, tone = 'dark' }) => {
  const errorClass = tone === 'paper' ? 'text-red-700' : 'text-red-300';
  const [state, setState] = useState<QrState>({ status: 'drawing' });
  const summary = useSummarySync(pack ?? null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'drawing' });
    QRCode.toString(url, QR_SVG_OPTIONS)
      .then(svg => { if (!cancelled) setState({ status: 'ready', svg }); })
      .catch((err: unknown) => {
        // Surfaced: the failed state renders SU_QR_FAILED with the message.
        if (!cancelled) setState({ status: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [url]);

  if (state.status === 'failed') {
    return <p role="alert" className={errorClass}>{SU_QR_FAILED}: {state.message}</p>;
  }
  return (
    <>
      <div
        data-testid="signup-qr"
        data-signup-url={url}
        role="img"
        aria-label={qrAltText(url)}
        className={`bg-white rounded-xl p-[2vh] [&>svg]:w-full [&>svg]:h-full ${className ?? ''}`}
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={state.status === 'ready' ? { __html: state.svg } : undefined}
      />
      {summary.status === 'failed' && (
        <p role="alert" data-testid="summary-failed" className={errorClass}>{summary.message}</p>
      )}
    </>
  );
};

export default SignupQr;
