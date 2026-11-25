/**
 * AIStatus.tsx — the primary content of the AI service page · AI 状态
 *
 * Signed in (no own key): "已登录 · AI 已就绪（由本站提供）" + this month's
 * usage (aiUsage) — nothing to configure, the server's allowlist picks the
 * models. Signed out: "登录即可使用AI · Sign in to use AI" + the sign-in
 * choices — Google or email (SignInChoices, ADR-0020) — and no mention of
 * keys (ADR-0007). Senior type floors from setupStrings (ADR-0003 §15); stl
 * colour tokens.
 */
import React from 'react';
import { SignInChoices } from '../signin/SignInChoices';
import { useAIUsage } from './aiUsage';
import { SETUP_HOSTED_READY, SETUP_SIGN_IN_TO_USE_AI, SETUP_USAGE_FAILED, usageLine, SETUP_MIN_FONT_PX } from './setupStrings';

const textStyle: React.CSSProperties = { fontSize: SETUP_MIN_FONT_PX, lineHeight: 1.5 };

export const HostedReady: React.FC<{ uid: string }> = ({ uid }) => {
  const usage = useAIUsage(uid);
  return (
    <div data-testid="ai-hosted-ready" className="flex flex-col gap-2">
      <p className="text-stl-gold" style={textStyle}>{SETUP_HOSTED_READY}</p>
      {usage.status === 'ready' && (
        <p data-testid="ai-usage" className="text-stl-text-2" style={textStyle}>{usageLine(usage.entries)}</p>
      )}
      {usage.status === 'failed' && (
        <p role="alert" className="text-red-300" style={textStyle}>{SETUP_USAGE_FAILED} · {usage.message}</p>
      )}
    </div>
  );
};

export const SignInToUseAI: React.FC = () => (
  <div data-testid="ai-sign-in" className="flex flex-col gap-3">
    <p className="text-stl-text" style={textStyle}>{SETUP_SIGN_IN_TO_USE_AI}</p>
    <SignInChoices />
  </div>
);
