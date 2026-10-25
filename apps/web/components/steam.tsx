import clsx from 'clsx';

/** Soft steam wisps over hot food. CSS-only (transform + opacity) and off under reduced motion. */
export function Steam({ className }: { className?: string }) {
  const wisps = [
    { left: '0%', delay: '0s', dur: '2.6s', drift: '-8px' },
    { left: '40%', delay: '0.9s', dur: '2.9s', drift: '10px' },
    { left: '80%', delay: '1.7s', dur: '2.4s', drift: '-4px' },
  ];
  return (
    <div className={clsx('pointer-events-none absolute h-24', className)} aria-hidden>
      {wisps.map((w, i) => (
        <span
          key={i}
          className="steam absolute bottom-0 h-20 w-3 rounded-full bg-bun/40"
          style={{ left: w.left, ['--steam-delay' as string]: w.delay, ['--steam-dur' as string]: w.dur, ['--drift' as string]: w.drift }}
        />
      ))}
    </div>
  );
}
