'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '@/lib/presence';

/**
 * Bottom sheet on phones, centered panel from md up. Slides in over 250 ms,
 * traps focus, closes on Escape or backdrop, and returns focus to the opener.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  theme = 'light',
}: {
  theme?: 'light' | 'dark';
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { mounted, shown } = usePresence(open);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => panel.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab' || !panel.current) return;
      const focusables = panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (typeof document === 'undefined' || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" data-theme={theme}>
      <div className="sheet-backdrop absolute inset-0 bg-ink/55" data-open={shown} onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-open={shown}
        className="sheet-panel relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-bg text-text focus:outline-none md:max-w-xl md:rounded-[28px]"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-line md:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-4 px-5 pb-2 pt-3">
          <h2 id={titleId} className="font-display-th text-xl font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="press grid size-10 place-items-center rounded-full bg-surface-2 hover:bg-line"
            aria-label="ปิด"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-line bg-surface px-5 py-4 md:rounded-b-[28px]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
