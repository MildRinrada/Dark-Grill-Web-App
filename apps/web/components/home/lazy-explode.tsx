'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

const ExplodeStack = dynamic(() => import('./explode-stack').then((m) => m.ExplodeStack), { ssr: false });

/** GSAP + ScrollTrigger only download once the section is about one screen away. */
export function LazyExplode() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '100% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <div ref={ref}>{near ? <ExplodeStack /> : <div className="min-h-[100svh]" aria-hidden />}</div>;
}
