/**
 * reducedMotion.ts — honour "prefers-reduced-motion" for scripted scrolls · 减少动态效果
 *
 * One source (R3) for the query and the scroll behaviour it implies: smooth
 * unless the user asked the system for reduced motion.
 * TODO(R3): components/landing/LandingNav.tsx still holds its own copy of
 * the query; import it from here when that file is next touched.
 */

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** 'auto' (instant) under reduced motion, else 'smooth'. */
export function motionScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth';
}
