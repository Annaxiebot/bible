/**
 * newStudyStyles.ts — shared inline styles + classes for the New-study UI · 样式
 *
 * Senior-readable floors reused from the quick AI setup (ADR-0003 §15):
 * text ≥ 20px, tap targets ≥ 48px. One source for the three components.
 */
import React from 'react';
import { SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../setup/QuickAISetup';

export const textStyle: React.CSSProperties = { fontSize: SETUP_MIN_FONT_PX, lineHeight: 1.5 };
export const controlStyle: React.CSSProperties = { ...textStyle, minHeight: SETUP_MIN_TAP_PX };
export const headingStyle: React.CSSProperties = { fontSize: SETUP_MIN_FONT_PX * 1.4, lineHeight: 1.3 };

export const inputClass =
  'w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 focus:border-amber-400 focus:outline-none';
export const primaryButtonClass =
  'rounded-lg bg-amber-500 px-6 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60';
export const secondaryButtonClass =
  'rounded-lg border border-slate-500 px-5 text-slate-100 hover:border-amber-400 disabled:opacity-60';
export const quietButtonClass = 'rounded-lg px-4 text-slate-400 hover:text-slate-100';
export const labelClass = 'flex flex-col gap-2 text-slate-400';
