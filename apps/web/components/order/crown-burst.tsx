'use client';

import { Crown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePresence } from '@/lib/presence';

const BITS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const r = 90 + (i % 3) * 30;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, c: i % 3 };
});

/** Short (about 800 ms) celebration when Crowns land. Used rarely so it stays special. */
export function CrownBurst({ trigger, label }: { trigger: unknown; label: string }) {
  const [open, setOpen] = useState(false);
  const { mounted, shown } = usePresence(open, 200);

  useEffect(() => {
    if (!trigger) return;
    setOpen(true);
    const t = setTimeout(() => setOpen(false), 1600);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!mounted) return null;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[75] grid place-items-center transition-opacity duration-200"
      style={{ opacity: shown ? 1 : 0 }}
      role="status"
    >
      <div className="relative grid place-items-center">
        {BITS.map((b, i) => (
          <span
            key={i}
            className={`crown-bit absolute size-3 rounded-sm ${b.c === 0 ? 'bg-cheese' : b.c === 1 ? 'bg-flame' : 'bg-sauce'}`}
            style={{ ['--bx' as string]: `${b.x}px`, ['--by' as string]: `${b.y}px` }}
          />
        ))}
        <div className="pop flex flex-col items-center gap-2 rounded-3xl bg-ink px-8 py-6 text-bun shadow-2xl">
          <Crown aria-hidden className="size-12 text-cheese" strokeWidth={2.2} />
          <p className="tabular text-2xl font-bold">{label}</p>
        </div>
      </div>
    </div>
  );
}
