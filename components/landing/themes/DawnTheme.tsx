/**
 * DawnTheme.tsx — "Light over the deep" · 渊面之光
 *
 * Genesis 1:2–3: darkness over the deep, then light. A very slow amber dawn
 * rises from the bottom of the hero over faint horizontal ripple bands.
 * 30–40s ease-in-out loop, never brighter than ~15% amber over slate-950.
 * CSS keyframes only; static under prefers-reduced-motion (dawn.css).
 */
import React from 'react';
import './dawn.css';

const DawnTheme: React.FC = () => (
  <>
    <div className="ld-ripples" data-testid="theme-dawn" />
    <div className="ld-dawn" />
  </>
);

export default DawnTheme;
