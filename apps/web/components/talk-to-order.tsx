'use client';

import { Mic, MicOff, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { baht } from '@/lib/format';
import { useCart } from './providers/cart';
import { useNotify } from './providers/feedback';
import { Button } from './ui';

interface DraftLine {
  menuItemId: string;
  name: string;
  qty: number;
  optionIds: string[];
  optionNames: string[];
  priceSatang: number;
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

/**
 * Type or speak an order in Thai ("ชีสเบอร์เกอร์ 2 อัน อันนึงไม่ใส่หัวหอม"). The
 * server turns it into a draft; nothing reaches the cart until the guest confirms.
 */
export function TalkToOrder({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<{ lines: DraftLine[]; unmatched: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const { add } = useCart();
  const notify = useNotify();

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setCanListen(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  const parse = async (value: string) => {
    if (value.trim().length < 2) return;
    setBusy(true);
    try {
      setDraft(await api('/ai/order-intent', { method: 'POST', body: { text: value } }));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'อ่านคำสั่งไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  };

  const listen = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) return rec.current?.stop();
    const r = new Ctor();
    r.lang = 'th-TH';
    r.interimResults = false;
    r.onresult = (e) => {
      const said = e.results[0][0].transcript;
      setText(said);
      void parse(said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      notify('ไม่ได้ยินชัด ลองพิมพ์แทนได้', 'info');
    };
    rec.current = r;
    setListening(true);
    r.start();
  };

  const confirm = async () => {
    if (!draft) return;
    setBusy(true);
    for (const l of draft.lines) await add({ menuItemId: l.menuItemId, qty: l.qty, optionIds: l.optionIds });
    setBusy(false);
    notify(`เพิ่ม ${draft.lines.reduce((a, l) => a + l.qty, 0)} รายการลงตะกร้าแล้ว`, 'success');
    setDraft(null);
    setText('');
  };

  const big = size === 'lg';
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className={`flex items-center gap-2 font-semibold ${big ? 'text-lg' : ''}`}>
        <Sparkles aria-hidden className="size-5 text-accent-text" />
        พิมพ์หรือพูดสั่งเป็นประโยค
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void parse(text);
        }}
      >
        <label htmlFor="talk" className="sr-only">
          คำสั่งอาหาร
        </label>
        <input
          id="talk"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="เช่น ชีสเบอร์เกอร์ 2 อัน อันนึงไม่ใส่หัวหอม กับน้ำส้ม"
          className={`w-full rounded-chip border border-line bg-bg px-5 hover:border-text/30 focus:border-text focus:outline-none ${big ? 'h-16 text-lg' : 'h-12'}`}
        />
        {canListen && (
          <Button
            type="button"
            variant="secondary"
            size={big ? 'xl' : 'lg'}
            onClick={listen}
            aria-pressed={listening}
            aria-label={listening ? 'หยุดฟัง' : 'พูดสั่ง'}
          >
            {listening ? <MicOff aria-hidden className="size-5" /> : <Mic aria-hidden className="size-5" />}
          </Button>
        )}
        <Button type="submit" size={big ? 'xl' : 'lg'} loading={busy && !draft} aria-label="แปลงเป็นรายการ">
          <Send aria-hidden className="size-5" />
        </Button>
      </form>
      {draft && (
        <div className="mt-4" role="status">
          {draft.lines.length === 0 ? (
            <p className="text-muted">ยังจับเมนูจากประโยคนี้ไม่ได้ ลองใช้ชื่อเมนูตามหน้าจอ</p>
          ) : (
            <>
              <p className="text-sm text-muted">ตรวจรายการก่อนเพิ่มลงตะกร้า</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {draft.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
                    <span>
                      <span className="font-semibold">
                        {l.qty} x {l.name}
                      </span>
                      {l.optionNames.length > 0 && <span className="block text-sm text-muted">{l.optionNames.join(' · ')}</span>}
                    </span>
                    <span className="tabular text-muted">{baht(l.priceSatang * l.qty)}+</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {draft.unmatched.length > 0 && <p className="mt-2 text-sm text-muted">ไม่เข้าใจ: {draft.unmatched.join(', ')}</p>}
          <div className="mt-3 flex gap-2">
            {draft.lines.length > 0 && (
              <Button onClick={confirm} loading={busy} size={big ? 'lg' : 'md'}>
                ยืนยัน เพิ่มลงตะกร้า
              </Button>
            )}
            <Button variant="ghost" onClick={() => setDraft(null)} size={big ? 'lg' : 'md'}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
