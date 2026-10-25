# Dark Grill: ระบบร้านเบอร์เกอร์แบบ Advanced

ระบบสั่งอาหารตัวเดียวที่ใช้ได้หลายช่องทาง ได้แก่ เว็บ/มือถือ (PWA), QR สั่งที่โต๊ะ, ตู้ Kiosk และจอครัว พร้อมหลังร้านแบบครบ สร้างตามเอกสาร [ระบบร้าน Burger แบบ Advanced — System Design.md](./ระบบร้าน%20Burger%20แบบ%20Advanced%20—%20System%20Design.md)

```
apps/api   NestJS 11 + Prisma 6 + PostgreSQL 16 + Redis 7 (BullMQ, Socket.IO adapter)
apps/web   Next.js 16 (App Router) + React 19.3 + Tailwind 4 + GSAP ScrollTrigger
```

## เริ่มใช้งาน

ต้องมี Node 22 และ Docker

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run setup        # เปิด Postgres/Redis, migrate และ seed ข้อมูลตัวอย่าง
npm run dev:api      # http://localhost:4000/api/v1
npm run dev:web      # http://localhost:3000
```

ตัว seed จะสร้าง 3 สาขา เมนู 22 รายการพร้อมตัวเลือก วัตถุดิบและสูตร (BOM) โปรโมชัน แคมเปญ พนักงานครบทุก role และออเดอร์ย้อนหลัง 60 วัน (ราว 5,900 ออเดอร์) เพื่อให้รายงาน, ระบบแนะนำสินค้า, menu engineering และการพยากรณ์มีข้อมูลจริงให้คำนวณ

### บัญชีทดลอง (เข้าสู่ระบบด้วย OTP)

เมื่อ `DEV_MODE=true` หน้าเข้าสู่ระบบจะแสดงรหัส OTP ให้เลย ไม่ต้องรอ SMS

| เบอร์ | บทบาท | ไปที่ |
| --- | --- | --- |
| 0811111111 | ลูกค้า (มีประวัติออเดอร์และ Crowns) | `/account` |
| 0800000001 | เจ้าของ (ทุกสาขา) | `/admin` |
| 0800000002 | ผู้จัดการสาขาสยาม | `/admin` |
| 0800000003 | แคชเชียร์ | `/admin/orders` |
| 0800000004 | ครัว | `/kitchen` |
| 0800000005 | ไรเดอร์ | `/kitchen` |

### หน้าหลัก

| URL | หน้าที่ |
| --- | --- |
| `/` | หน้าแบรนด์ธีมดำ: hero ซ้อนเลเยอร์ + parallax, ฉาก explode & stack ด้วย GSAP |
| `/menu`, `/menu/[slug]` | เมนูธีมสว่าง, bottom sheet ตัวเลือก, fly-to-cart, shared-element transition |
| `/build` | Build-your-burger วัตถุดิบตกลงมาซ้อน ราคา/แคลอรีนับขึ้นสด |
| `/cart`, `/checkout` | ตะกร้า + upsell 1 รายการ, โค้ดส่วนลด, เดลิเวอรี/รับเอง/ทานที่ร้าน, นัดเวลา |
| `/orders/[id]` | QR พร้อมเพย์, แถบสถานะเรียลไทม์, เส้นทางไรเดอร์โดยประมาณ, รีวิวพร้อมรูป |
| `/t/siam/12` | ตัวอย่าง QR โต๊ะ 12 (ผูกตะกร้ากับโต๊ะ เรียกพนักงาน/ขอเช็กบิล) |
| `/kiosk` | โหมด Kiosk จอใหญ่ ธีมดำ รีเซ็ตเองเมื่อไม่มีคนใช้ พิมพ์/พูดสั่งเป็นภาษาไทย |
| `/kitchen` | จอครัว (KDS) ออเดอร์เข้าเรียลไทม์ จับเวลา แตะเปลี่ยนสถานะ ปิดเมนูที่หมด |
| `/admin/*` | ภาพรวมยอดขาย, ออเดอร์/คืนเงิน/รับเงินสด, เมนู, สต็อกและสูตร, วิเคราะห์เมนู + พยากรณ์, โปรและรีวิว, พนักงาน |

การชำระเงินใช้ผู้ให้บริการจำลองชื่อ `mockpay` ที่ทำงานเหมือน gateway จริง คือสร้าง QR แล้วรอผลผ่าน webhook ที่เซ็นลายเซ็น HMAC มาให้ ปุ่ม "จำลองว่าลูกค้าจ่ายสำเร็จ" จะเซ็น event แล้วส่งเข้า webhook endpoint จริง ทำให้การตรวจลายเซ็น, idempotency และ state machine ทำงานครบทุกขั้นเหมือนตอนใช้งานจริง

## ทำอะไรไปแล้วบ้าง เทียบกับเอกสาร

### กลุ่มพื้นฐาน (MVP): ครบ

เมนูแยกหมวดไม่เกิน 12 รายการ (บังคับที่ API ด้วย), ค้นหา/กรองเผ็ด/มังสวิรัติ, หน้าสินค้าและตัวเลือก (บังคับ min/max ที่ server), ตะกร้าและ checkout 3 แบบ, พร้อมเพย์/บัตร/เงินสด, สถานะออเดอร์ realtime, OTP login + หลายที่อยู่, โค้ดส่วนลด (% / บาท / ส่งฟรี / ขั้นต่ำ / หมดอายุ / จำกัดครั้ง), ข้อมูลแคลอรี/สารก่อภูมิแพ้/เวลาปรุง, admin เมนู + อัปโหลดรูป, จอครัว, รายงานยอดขาย/เมนูขายดี/ชั่วโมงพีค

### กลุ่ม Advanced: ครบ ยกเว้น LINE ที่ต้องมีบัญชีจริง

Build-your-burger, upsell ในตะกร้าแบบดูทั้งตะกร้า (กฎ + co-occurrence จากออเดอร์จริง), สั่งซ้ำ 1 แตะ, Loyalty Crowns (tier, ภารกิจ, แลกรางวัลเป็นโค้ด), QR สั่งที่โต๊ะ, Kiosk mode, สต็อกตามสูตร BOM (ขายแล้วตัดของ, ของหมดปิดเมนูเองแล้วเปิดคืนเมื่อรับของ), หลายสาขา + ค่าส่งตามระยะ, menu engineering (Kasavana & Smith), campaign engine (Happy hour, ซื้อ X แถม Y, flash sale), รีวิวพร้อมรูป + ตอบรีวิว, role & permission 5 บทบาท

LINE: มีโค้ด LINE Login (ตรวจ id token), ตรวจลายเซ็น webhook ของ OA และ push แจ้งสถานะผ่าน BullMQ แล้ว แต่ยังไม่ได้ทดสอบกับบัญชีจริง ต้องใส่ `LINE_CHANNEL_*` ใน `.env` ก่อน ส่วนหน้า LIFF ยังไม่ได้ทำ

### กลุ่มโคตรเจ๋ง: ทำบางส่วน

| ฟีเจอร์ | สถานะ |
| --- | --- |
| Kitchen-load ETA | ทำแล้ว: ETA คิดจากคิวในครัวจริงหารจำนวนพนักงาน ถ้าครัวแน่นจะเลื่อนเวลาออกแทนการรับเกินกำลัง |
| Demand forecasting | ทำแล้ว (baseline): เฉลี่ยวันเดียวกันของ 4 สัปดาห์ก่อน แล้วแปลงเป็นวัตถุดิบที่ต้องเตรียมผ่านสูตร |
| Context menu ranking | ทำแล้ว: เรียงเมนูตามยอดขายในช่วงเวลาเดียวกัน (เช้า/กลางวัน/บ่าย/เย็น/ดึก) ยังไม่ได้ใช้สภาพอากาศ |
| สั่งด้วยแชท/เสียงภาษาไทย | ทำแล้วแบบ rule-based (ไม่ใช้ LLM) แปลงประโยคเป็นตะกร้าร่างให้ลูกค้ายืนยันก่อน ฝั่งเสียงใช้ Web Speech API ของเบราว์เซอร์ |
| AI basket completion | ยังเป็นกฎ + co-occurrence ตาม Roadmap Phase 2 ยังไม่ได้เทรนโมเดล |
| 3D/AR, Group order, Community burger, Live kitchen cam | ยังไม่ได้ทำ |

### สิ่งที่ยังไม่ครบหรือทำต่างจากเอกสาร

- หน้าเมนูใช้ SSR + `revalidate: 30` ร่วมกับ socket อัปเดตของหมดแบบสด ยังไม่ได้เปิด Partial Prerendering
- ยังไม่ได้ต่อ OpenTelemetry/Sentry/RUM ตัวเลขด้านล่างวัดในเครื่องทดสอบ
- ยังไม่ได้ทำ web push, ของขวัญวันเกิด และแผนที่ไรเดอร์จาก GPS จริง (ตอนนี้ตำแหน่งไรเดอร์เป็นค่าประมาณตามเวลา)
- ภาพอาหารมาจาก Unsplash ใช้เพื่อสาธิตเท่านั้น เอกสารกำหนดว่าก่อนใช้งานจริงต้องเปลี่ยนเป็นภาพของจริงที่ร้านขาย (อัปโหลดได้ที่ `/admin/menu`)

## การทดสอบ

```bash
npm run -w apps/api test       # unit: pricing, campaigns, promo, ค่าส่ง, menu engineering, PromptPay CRC
npm run -w apps/api test:e2e   # e2e กับ API ที่รันอยู่: 19 flow
```

e2e ครอบคลุม: ราคาคิดใหม่ที่ server เสมอ, ต้องส่ง Idempotency-Key และส่งซ้ำแล้วได้ออเดอร์เดิม, webhook ลายเซ็นผิดถูกปฏิเสธ, webhook ซ้ำไม่ตัดเงินสองรอบ, state machine และสิทธิ์ตาม role, guest cart ย้ายเข้าบัญชีหลัง login, Crowns เข้าเมื่อออเดอร์สำเร็จ, BOM ตัดวากิวชิ้นสุดท้ายแล้วเมนูปิดเองและเปิดคืนเมื่อรับของ, ยกเลิกหลังจ่ายแล้วคืนเงินอัตโนมัติ, parser ภาษาไทย และรายงานต่างๆ

## Performance budget (วัดจาก `next build` + `next start`)

วัดบนมือถือจำลอง 390px, เครือข่าย 9 Mbps / RTT 60 ms, CPU ช้าลง 4 เท่า

| หน้า | LCP (budget ≤ 2.0 วิ) | JS เริ่มต้น gzip (budget ≤ 170 KB) | CLS |
| --- | --- | --- | --- |
| `/` | 0.88 วิ | 153 KB | 0.000 |
| `/menu` | 0.90 วิ | 159 KB | 0.017 |
| `/menu/fire-grill` | 0.83 วิ | 159 KB | 0.000 |
| `/cart`, `/checkout`, `/orders/[id]`, `/build` | ไม่ได้วัด LCP | 153-162 KB | ไม่ได้วัด |

วิธีที่ทำให้ผ่าน budget: อนิเมชันฝั่งลูกค้าใช้ CSS, Web Animations API และ rAF แทนไลบรารี, GSAP โหลดเฉพาะตอนใกล้ถึงฉาก explode, socket.io-client และ qrcode โหลดเมื่อใช้งาน และภาพที่เป็น LCP ไม่เริ่มจาก opacity 0
ภาพ hero แบบตัดพื้นมีขนาด 34 KB (budget 120 KB)

ข้อยกเว้น: `/kiosk` (206 KB) และ `/kitchen` (199 KB) ยังใช้ motion เพราะเป็นอุปกรณ์ในร้านที่โหลดครั้งเดียวแล้วเปิดค้างไว้

## สถาปัตยกรรมโดยย่อ

- ทุกช่องทางใช้ API ชุดเดียวที่ `/api/v1` เมนู ราคา และสต็อกจึงตรงกันทุกจอ เว็บเข้าถึง API ผ่าน rewrite แบบ same-origin เพื่อให้ refresh cookie เป็น first-party
- เงินเก็บเป็นสตางค์ (integer) ราคาคำนวณใหม่ใน `apps/api/src/cart/pricing.ts` (pure function มี unit test) และไม่เชื่อราคาที่มาจาก client
- `POST /orders` และ `POST /payments` ต้องมี `Idempotency-Key` โดยมี Redis lock กันคำขอซ้อนกัน และบันทึก response เดิมไว้ใน Postgres
- ทุก error ใช้รูปแบบเดียว `{ "error": { "code", "message", "details" } }`
- Auth: JWT access 15 นาที + refresh token แบบหมุนเวียนใน httpOnly cookie ถ้าพบ token ที่ถูกใช้ไปแล้ว ระบบจะยกเลิกทุก session ของผู้ใช้นั้น
- Realtime: Socket.IO + Redis adapter ใช้ room `order:{id}`, `kitchen:{branch}`, `branch:{branch}`, `admin` ตามเอกสาร ห้อง order ตรวจสิทธิ์ด้วย token ของออเดอร์
- คิวงาน (BullMQ): ปิดออเดอร์ที่ไม่จ่ายใน 15 นาที (เงินสด 30 นาที) และส่งแจ้งเตือนสถานะ
- Rate limit ต่อ IP และต่อผู้ใช้ผ่าน Redis โดย OTP มีลิมิตแยกต่อเบอร์และต่อ IP

## เครดิตภาพ

ภาพอาหารทั้งหมดจาก [Unsplash](https://unsplash.com) (Unsplash License) ใช้เพื่อการสาธิต ไม่ได้ใช้รูปที่มีโลโก้แบรนด์อื่น
