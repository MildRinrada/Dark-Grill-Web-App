'use client';

import { useEffect, useRef } from 'react';

/** Counts from the previous value to the new one; used for live price and calories. */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    prev.current = value;
    if (from === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = format(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 350);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, format]);

  return (
    <span ref={ref} className="tabular">
      {format(value)}
    </span>
  );
}
