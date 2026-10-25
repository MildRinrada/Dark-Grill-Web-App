'use client';

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState } from 'react';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const Ctx = createContext<(message: string, tone?: Tone) => void>(() => undefined);

const ICON = { success: CircleCheck, error: CircleAlert, info: Info };

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (message: string, tone: Tone = 'info') => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-2), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={notify}>
      {children}
      <div
        aria-live="polite"
        role="status"
        data-theme="dark"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-8"
      >
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div
              key={t.id}
              className="toast-in pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-text shadow-2xl"
            >
              <Icon
                aria-hidden
                className={`mt-0.5 size-4 shrink-0 ${t.tone === 'success' ? 'text-success' : t.tone === 'error' ? 'text-danger' : 'text-cheese'}`}
              />
              <span className="flex-1">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="press -mr-1 rounded-full p-1 text-muted hover:text-text"
                aria-label="ปิดข้อความ"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useNotify = () => useContext(Ctx);
