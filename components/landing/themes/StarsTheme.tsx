/**
 * StarsTheme.tsx — "He counts the stars and names each one" · 數點星宿
 *
 * Psalm 147:4. ~40 sparse tiny stars (1–2px, slate-300 at 30–60%) breathing
 * on staggered 8–20s cycles; every ~10s one warms to amber and swells
 * slightly — named. No flicker, nothing fast. CSS keyframes only; static
 * under prefers-reduced-motion (stars.css).
 */
import React from 'react';
import './stars.css';

export const STAR_COUNT = 40;
const NAMED_EVERY = 10;             // every 10th star gets "named" → 4 named stars
const NAMED_CYCLE_S = 40;           // 4 named stars on a 40s cycle → one every ~10s
const BREATHE_MIN_S = 8;
const BREATHE_RANGE_S = 12;         // 8–20s

interface Star {
  x: number;    // viewBox units (0–100)
  y: number;    // kept in the upper 70% so a dawn layer could own the bottom
  r: number;    // viewBox units; ~8–13px per unit, so 0.12–0.22 ≈ 1–2px
  dur: number;
  delay: number;
  nameDelay?: number;
}

/** Tiny deterministic LCG so the sky is identical on every render and test. */
function makeRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function buildStars(): Star[] {
  const rng = makeRng(147);
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const named = i % NAMED_EVERY === 0;
    stars.push({
      x: Math.round(rng() * 1000) / 10,
      y: Math.round(rng() * 700) / 10,
      r: 0.12 + Math.round(rng() * 10) / 100,
      dur: BREATHE_MIN_S + Math.round(rng() * BREATHE_RANGE_S * 10) / 10,
      delay: -Math.round(rng() * BREATHE_MIN_S * 10) / 10,
      nameDelay: named ? (i / NAMED_EVERY) * (NAMED_CYCLE_S / (STAR_COUNT / NAMED_EVERY)) : undefined,
    });
  }
  return stars;
}

const STARS = buildStars();

const StarsTheme: React.FC = () => (
  <svg
    className="ld-stars"
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
    data-testid="theme-stars"
  >
    {STARS.map((s, i) => (
      <circle
        key={i}
        cx={s.x}
        cy={s.y}
        r={s.r}
        className={s.nameDelay === undefined ? 'ld-star' : 'ld-star ld-star-named'}
        style={{
          '--ld-dur': `${s.dur}s`,
          '--ld-delay': `${s.delay}s`,
          '--ld-name-delay': `${s.nameDelay ?? 0}s`,
        } as React.CSSProperties}
      />
    ))}
  </svg>
);

export default StarsTheme;
