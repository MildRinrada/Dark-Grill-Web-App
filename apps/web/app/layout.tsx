import type { Metadata, Viewport } from 'next';
import { Anton, IBM_Plex_Sans_Thai, Inter, Kanit, Permanent_Marker } from 'next/font/google';
import { CartProvider } from '@/components/providers/cart';
import { FeedbackProvider } from '@/components/providers/feedback';
import { SessionProvider } from '@/components/providers/session';
import './globals.css';

const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton', display: 'swap' });
const kanit = Kanit({ weight: ['600', '700', '800', '900'], subsets: ['thai', 'latin'], variable: '--font-kanit', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const plexThai = IBM_Plex_Sans_Thai({
  weight: ['400', '500', '600', '700'],
  subsets: ['thai'],
  variable: '--font-plex-thai',
  display: 'swap',
});
const marker = Permanent_Marker({ weight: '400', subsets: ['latin'], variable: '--font-marker', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Dark Grill | เบอร์เกอร์ย่างไฟแรง', template: '%s | Dark Grill' },
  description: 'สั่งเบอร์เกอร์ย่างไฟแรงจาก Dark Grill ได้ทั้งเว็บ LINE สแกน QR ที่โต๊ะ และตู้ Kiosk ติดตามออเดอร์แบบเรียลไทม์',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#0E0E0F',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      data-theme="light"
      className={`${anton.variable} ${kanit.variable} ${inter.variable} ${plexThai.variable} ${marker.variable}`}
    >
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
        >
          ข้ามไปเนื้อหาหลัก
        </a>
        <SessionProvider>
          <FeedbackProvider>
            <CartProvider>{children}</CartProvider>
          </FeedbackProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
