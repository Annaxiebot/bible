/**
 * BirdsLayer.tsx — grace note composed on top of any theme · 天上的飞鸟
 *
 * Matthew 6:26: two faint bird silhouettes drift across the far background
 * once every ~45s at ~10% opacity. Not a theme of its own (yet) — a layer
 * LandingSky stacks over the selected theme. Static under reduced motion.
 */
import React from 'react';
import './birds.css';

const BirdsLayer: React.FC = () => (
  <svg
    className="ld-birds"
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
    data-testid="layer-birds"
  >
    <g className="ld-bird-flight">
      <path className="ld-bird" d="M0 30c1-1.2 2-1.2 3 0M3 30c1-1.2 2-1.2 3 0" />
      <path className="ld-bird" d="M8 34c0.8-1 1.6-1 2.4 0M10.4 34c0.8-1 1.6-1 2.4 0" />
    </g>
  </svg>
);

export default BirdsLayer;
