'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" data-theme="light" className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-text">
      <div>
        <h1 className="font-display-th text-3xl font-black">มีบางอย่างผิดพลาด</h1>
        <p className="mt-2 text-muted">ข้อมูลในตะกร้ายังอยู่ ลองโหลดหน้านี้อีกครั้ง</p>
        <button
          type="button"
          onClick={reset}
          className="press mt-6 inline-flex h-12 items-center rounded-chip bg-accent px-6 font-semibold text-accent-ink"
        >
          ลองอีกครั้ง
        </button>
      </div>
    </main>
  );
}
