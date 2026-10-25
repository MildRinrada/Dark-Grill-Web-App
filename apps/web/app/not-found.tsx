import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" data-theme="dark" className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-text">
      <div>
        <p className="font-display text-[30vw] leading-none text-flame sm:text-[200px]">404</p>
        <h1 className="mt-2 font-display-th text-3xl font-black">ไม่เจอหน้านี้</h1>
        <p className="mt-2 text-muted">ลิงก์อาจเปลี่ยนไปแล้ว หรือเมนูนี้ถูกเก็บเข้าคลัง</p>
        <Link href="/menu" className="press mt-6 inline-flex h-12 items-center rounded-chip bg-accent px-6 font-semibold text-accent-ink">
          ไปที่เมนู
        </Link>
      </div>
    </main>
  );
}
