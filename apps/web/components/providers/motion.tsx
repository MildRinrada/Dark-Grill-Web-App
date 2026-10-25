'use client';

import { LazyMotion } from 'motion/react';

// Animation features load after first paint so they stay out of every page's critical JS.
const loadFeatures = () => import('./motion-features').then((r) => r.default);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
