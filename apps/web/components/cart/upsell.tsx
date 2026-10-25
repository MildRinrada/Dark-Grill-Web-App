'use client';

import { Plus, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { baht } from '@/lib/format';
import type { Suggestion } from '@/lib/types';
import { AddSheet } from '../menu/add-sheet';

const DISMISS_KEY = 'upsell-dismissed';

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/**
 * One within-basket suggestion. It is optional, closes in one tap, never adds
 * anything by itself, and carries no countdown (design doc, ethics note).
 */
export function Upsell({ cartKey, branchId }: { cartKey: string; branchId: string }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [adding, setAdding] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api<{ suggestion: Suggestion | null }>('/recommendations?context=cart')
      .then((r) => {
        if (!alive) return;
        const s = r.suggestion;
        setSuggestion(s && !readDismissed().includes(s.id) ? s : null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cartKey]);

  const dismiss = () => {
    if (!suggestion) return;
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...readDismissed(), suggestion.id]));
    } catch {
      /* private mode: dismissal lasts until reload */
    }
    setSuggestion(null);
  };

  return (
    <>
      {suggestion && (
        <aside
          aria-label="แนะนำเพิ่มเติม"
          className="toast-in mt-4 flex items-center gap-4 overflow-hidden rounded-card border border-line bg-surface-2 p-3"
        >
          <div ref={imageRef} className="relative size-16 shrink-0 overflow-hidden rounded-xl">
            <Image src={suggestion.imageUrl} alt="" fill sizes="64px" className="object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{suggestion.reason}</p>
            <p className="truncate font-semibold">
              {suggestion.name} <span className="tabular text-accent-text">{baht(suggestion.priceSatang)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="press inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-text px-4 text-sm font-semibold text-bg"
          >
            <Plus aria-hidden className="size-4" /> เพิ่ม
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="press grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-line hover:text-text"
            aria-label="ไม่ใช่ตอนนี้"
          >
            <X aria-hidden className="size-4" />
          </button>
        </aside>
      )}
      <AddSheet item={adding ? suggestion : null} branchId={branchId} sourceEl={imageRef.current} onClose={() => setAdding(false)} />
    </>
  );
}
