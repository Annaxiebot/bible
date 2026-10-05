/**
 * PaperHeader.tsx — the member pages' brand link home · 成员页品牌栏
 *
 * One shared header (R3) at the top of #/signup (every step + thank-you),
 * #/checkin, the stop page and #/qr: the wordmark "Scripture to Life" +
 * "活出神的话" as one link to the landing (LANDING_HASH). The wordmark stays
 * English-first (ADR-0003 exception, as on the landing); the Chinese is in
 * 霞鹜文楷 LXGW WenKai. ≥ 48px tap target; never printed (the #/qr page
 * prints only title, QR and URL).
 */
import React from 'react';
import { LANDING_HASH } from '../landing/landingRoute';
import { BRAND_EN, BRAND_ZH, HOME_LINK_LABEL } from '../landing/landingStrings';
import { SETUP_MIN_TAP_PX } from '../setup/setupStrings';

export const PAPER_HOME_TEST_ID = 'paper-home-link';

const linkStyle: React.CSSProperties = { minHeight: SETUP_MIN_TAP_PX };
const zhStyle: React.CSSProperties = { fontFamily: 'var(--stl-font-zh-head)' };

const PaperHeader: React.FC = () => (
  <a href={LANDING_HASH} data-testid={PAPER_HOME_TEST_ID} aria-label={HOME_LINK_LABEL} style={linkStyle}
    className="inline-flex flex-wrap items-center gap-x-2 self-start rounded-lg font-bold text-stl-gold-deep no-underline hover:text-stl-ink print:hidden">
    <span className="stl-head">{BRAND_EN}</span>
    <span aria-hidden="true" className="text-stl-ink-2">·</span>
    <span style={zhStyle}>{BRAND_ZH}</span>
  </a>
);

export default PaperHeader;
