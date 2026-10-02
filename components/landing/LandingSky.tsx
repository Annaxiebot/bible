/**
 * LandingSky.tsx — the hero's living background · 首頁夜空
 *
 * Theme: God's sovereignty and care, without intimidation — vast scale,
 * gentle motion. Renders the selected hero theme (see heroThemes.ts) with
 * the birds grace note (Matthew 6:26) composed on top. Everything sits
 * behind content, fixed, pointer-events none, CSS keyframes only, and goes
 * static under prefers-reduced-motion (each theme's own stylesheet).
 */
import React from 'react';
import './landingSky.css';
import type { HeroTheme } from './heroThemes';
import BirdsLayer from './themes/BirdsLayer';

const LandingSky: React.FC<{ theme: HeroTheme }> = ({ theme }) => (
  <div
    className="ld-sky"
    style={{ pointerEvents: 'none' }}
    aria-hidden="true"
    data-testid="landing-sky"
    data-theme={theme.id}
  >
    <theme.Component />
    <BirdsLayer />
  </div>
);

export default LandingSky;
