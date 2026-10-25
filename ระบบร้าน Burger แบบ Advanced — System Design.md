# ระบบร้าน Burger แบบ Advanced — System Design

Oct 25, 2026 · @Tgiz4

## ภาพรวม

ระบบนี้เป็น ordering platform ของร้าน Burger ตัวเดียวที่ใช้ได้ 4 ช่องทาง (เว็บ/มือถือ, LINE, QR โต๊ะ, Kiosk) โดยออกแบบรอบ 4 ข้อค้นพบจากงานวิจัย: ความเร็ว, ภาพอาหาร, จำนวนตัวเลือก และการแนะนำสินค้าเสริมในตะกร้า

| ข้อค้นพบ | ที่มา | ใช้ในระบบอย่างไร |
| --- | --- | --- |
| เว็บมือถือเร็วขึ้น 0.1 วิ ทำให้ conversion ฝั่ง retail ขึ้น 8.4% และ AOV ขึ้น 9.2% (37 แบรนด์, 30 ล้าน session) | [Deloitte/Google, Milliseconds Make Millions](https://web.dev/case-studies/milliseconds-make-millions) | เลือก stack ที่ render ฝั่ง server + ตั้ง performance budget |
| ความสูงและปริมาณอาหารในภาพเปลี่ยนความอยากอาหารได้ | [Ichikawa et al. 2006, Kansei Eng. Int.](https://www.jstage.jst.go.jp/article/kei1999/6/1/6_1_13/_article) | ถ่าย burger มุมต่ำให้ดูสูง ชั้นแน่น |
| เครื่องเคียงข้างจานหลักกระตุ้นความอยากอาหาร และอาหารต้องดูอุ่น | [Frontiers in Psychology 2021](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.699218/full) | วางเฟรนช์ฟรายส์/ผักสด/ไอร้อนข้าง burger ในทุกภาพหลัก |
| ภาพอาหารดึงความสนใจได้แม้ไม่หิว และยิ่งหิวยิ่งแรง | [Davidson et al. 2018, Appetite](https://livrepository.liverpool.ac.uk/3016779/) | ภาพอาหารเป็นพระเอกของ UI, ข้อความเป็นรอง |
| ตัวเลือกมากเกินลดแรงจูงใจในการเลือก; สมองตอบสนองดีสุดที่ 12 ตัวเลือก เทียบกับ 6 หรือ 24 | [Iyengar & Lepper 2000](<https://faculty.washington.edu/jdb/345/345%20Articles/Iyengar%20&%20Lepper%20(2000).pdf>), [Caltech, Nature Human Behaviour 2018](https://camerergroup.caltech.edu/news-blog/scientists-uncover-why-you-cant-decide-what-order-lunch-83881) | แต่ละหมวดแสดงไม่เกิน \~12 รายการ |
| การใช้แอปเดลิเวอรีต่อเนื่องขึ้นกับ perceived value, task-technology fit และความเชื่อมั่นเรื่องความปลอดภัยอาหาร | [Foroughi et al. 2024, IJCHM](https://www.emerald.com/insight/content/doi/10.1108/IJCHM-10-2022-1209/full/html) | แสดงข้อมูลสุขอนามัย/เวลาปรุงชัด, ราคาโปร่งใส |
| การแนะนำของในตะกร้า (within-basket) ต้องจับ intent หลายอย่างในตะกร้าเดียว | [Neural Pattern Associator, arXiv 2024](https://arxiv.org/html/2401.16433v1), [S2SRec2, arXiv 2025](https://arxiv.org/abs/2507.09101) | เครื่อง upsell/combo แบบเห็นทั้งตะกร้า |

หมายเหตุ: ตัวเลข Kiosk เพิ่มยอดต่อบิล 10–30% มาจากรายงานอุตสาหกรรมและผู้ขาย ไม่ใช่งาน peer-reviewed จึงใช้เป็นสมมติฐานที่ต้องวัดเอง ไม่ใช่ข้อเท็จจริง

## 1. Framework & Tech Stack

ใช้ Next.js 16 (App Router) ฝั่งหน้าบ้าน + NestJS ฝั่ง API + PostgreSQL/Redis เพราะงานวิจัยข้างบนชี้ว่าความเร็วโหลดผูกกับยอดขายโดยตรง และ Next.js render ฝั่ง server + Partial Prerendering ทำให้หน้าเมนูขึ้นทันทีขณะที่ราคา/สต็อกสด stream ตามมา ([Next.js blog](https://nextjs.org/blog))

| ชั้น | เลือกใช้ | เหตุผล |
| --- | --- | --- |
| Web / PWA | Next.js 16 + React + TypeScript | SSR/PPR ลดเวลาเห็นเนื้อหาแรก, SEO หน้าเมนู, ติดตั้งเป็น PWA ได้ |
| Styling | Tailwind CSS + design tokens (CSS variables) | สลับธีมดำ/ส้ม/แดง ได้จาก token ชุดเดียว |
| Animation | Motion (Framer Motion) + GSAP ScrollTrigger | Motion สำหรับ micro-interaction/layout, GSAP สำหรับ scroll story หน้า hero |
| 3D (ระดับโคตรเจ๋ง) | React Three Fiber หรือ `<model-viewer>` | แสดง burger 3D / AR บนมือถือ |
| LINE | LIFF + LINE OA Messaging API | ลูกค้าไทยสั่งใน LINE ได้โดยไม่ต้องลงแอป, แจ้งสถานะผ่าน OA |
| API | NestJS (REST + WebSocket gateway) | แยก module ชัด (menu, order, payment, kitchen), รองรับ realtime |
| Database | PostgreSQL + Prisma | order/payment ต้องการ transaction แบบ ACID |
| Cache / Queue | Redis + BullMQ | cache เมนู, คิวงานส่ง notification, ล็อกสต็อก |
| Realtime | Socket.IO (Redis adapter) | สถานะออเดอร์ / จอครัว / ตำแหน่งไรเดอร์ |
| Payment | PromptPay QR + บัตร ผ่าน payment gateway ไทย | รับ webhook ยืนยันชำระ |
| Media | Object storage + CDN + Next/Image (AVIF/WebP) | ภาพอาหารคือตัวขาย ต้องคมแต่เบา |
| AI | Python service (FastAPI) แยก | โมเดลแนะนำสินค้า / พยากรณ์ยอด |
| Observability | OpenTelemetry + Sentry + Web Vitals RUM | วัดความเร็วจริงของลูกค้า ไม่ใช่แค่ lab |

Performance budget ที่ตั้งไว้: LCP ≤ 2.0 วิ บน 4G, INP ≤ 200 ms, JS ต่อหน้า ≤ 170 KB (gzip) และภาพ hero ≤ 120 KB

&#91;embedded content: สถาปัตยกรรมระบบ · 5 ช่องทาง, API กลาง, 4 บริการข้อมูล\]

ทุกช่องทาง (เว็บ, LINE, QR, Kiosk, ครัว) ใช้ API ชุดเดียว เมนู ราคา และสต็อกจึงตรงกันทุกจอ; ระบบชำระเงินและ LINE คุยกับ API ผ่าน webhook

## 2. Design Theme

ธีมคือ "Dark Grill": พื้นดำถ่าน + ส้มไฟ + แดงซอส จากภาพแรก (hero ดำ ตัวอักษรใหญ่หลัง burger) และภาพที่สอง (แอปมือถือ แดง-ส้ม การ์ดขาวโค้งมน) โดยใช้ธีมดำกับหน้า brand/hero และธีมสว่างกับหน้าสั่งซื้อที่ต้องอ่านเร็ว

**สี (design tokens)**

| Token | ค่า | ใช้ที่ |
| --- | --- | --- |
| `--bg-char` | #0E0E0F | พื้นหลัง hero, เว็บ brand, Kiosk |
| `--surface-dark` | #1A1A1C | การ์ดบนพื้นดำ |
| `--flame` | #FF8A00 | ปุ่ม CTA หลัก, ราคา, badge (ส้มจากภาพแรก) |
| `--sauce` | #E5381B | หัวหน้าแอป, หน้า welcome, โปรโมชัน (แดงจากภาพที่สอง) |
| `--cheese` | #FFC23D | ดาวรีวิว, แต้มสะสม |
| `--lettuce` | #3DB46D | สถานะสำเร็จ / มีของ |
| `--bun` | #FFF6EC | พื้นหน้าสั่งซื้อธีมสว่าง |
| `--ink` | #1B1B1B | ตัวหนังสือบนพื้นสว่าง |

โทนอุ่น (ส้ม/แดง/เหลือง) ช่วยให้อาหารดูร้อน ซึ่งงานวิจัย plating ระบุว่าสำคัญต่อความอยากอาหาร

**ฟอนต์**

- Display อังกฤษ: Anton หรือ Bebas Neue (condensed หนา แบบคำว่า BURGERS ในภาพ)
- Display ไทย: Kanit Black/ExtraBold (เข้ากับ condensed และอ่านง่ายบนมือถือ)
- Body: Inter + IBM Plex Sans Thai
- Hand-drawn accent: ป้ายแบบพู่กัน (เช่น "Earn Crowns" ในภาพ) ใช้เฉพาะ badge โปรโมชัน ไม่เกิน 1 จุดต่อหน้าจอ

**Layout หลัก**

1. Hero (เว็บ): ตัวอักษร BURGERS ขนาดเต็มจอวางเลเยอร์หลัง burger แบบตัดพื้นหลัง ทำให้เกิดมิติลึก, ชื่อเมนูซ้ายล่าง, ปุ่มส้มรูปแคปซูล, รายการเมนูถัดไปเป็น thumbnail ด้านขวา, social icons แนวตั้งซ้าย
2. Home (แอป): header โค้งมนพื้นภาพมืด + แบนเนอร์ส่วนลด, ช่องค้นหาขาวกลมมน, แถบหมวดเป็นไอคอนกล่องมนเลื่อนแนวนอน, การ์ดร้าน/เมนูขาวมุมโค้ง 16–20 px มี badge ส่วนลดสีแดง
3. Product: ภาพ burger เต็มความกว้างด้านบน, ราคาเดิมขีดฆ่า + ราคาใหม่สีส้ม, ตัวเลือก add-on เป็น chip, ปุ่ม "+" ลอยบนการ์ด

**แนวภาพอาหาร (อิงวิจัย)**

- ถ่ายมุมต่ำ 10–20° ให้ burger ดูสูงและชั้นแน่น (ความสูงมีผลต่อความอยาก)
- วางเครื่องเคียง (ฟรายส์ ผักสด ซอส) ข้างจานหลักทุกภาพ
- ใช้ PNG/WebP ตัดพื้นหลังสำหรับ hero เพื่อทำ layer animation ได้
- ภาพต้องเป็นของจริงที่ร้านขาย ห้ามใช้ภาพสต็อกที่ต่างจากของจริง (ลด perceived value และความเชื่อมั่น)

ข้อควรระวัง: ภาพที่สองมีโลโก้แบรนด์อื่น ใช้แค่เป็นแนวทาง layout ห้ามนำโลโก้ ชื่อ หรือภาพมาใช้จริง

## 3. Animation & Motion

animation ทุกตัวต้องทำหน้าที่ (ยืนยันการกระทำ, บอกทิศทาง, ดึงสายตาไปที่อาหาร) และอยู่ในกรอบเวลา 100–500 ms ตามงานของ Nielsen Norman Group ที่ 0.1 วิรู้สึกทันที และ 1 วิคือขอบความต่อเนื่องของความคิด ([Val Head สรุปงาน NN/g + Model Human Processor](https://valhead.com/?p=2978)); งาน UI ที่เปลี่ยนจอใหญ่ใช้ 200–300 ms ([NN/g ผ่าน W3C CSSWG](https://lists.w3.org/Archives/Public/public-css-archive/2025Apr/0702.html))

| Animation | ใช้ที่ | ระยะเวลา | ทำไมได้ผล |
| --- | --- | --- | --- |
| Layered hero parallax: ตัวอักษร BURGERS ขยับช้า, burger ลอยเร็วกว่า, ฟรายส์เอียงตามเมาส์/gyroscope | หน้าแรกเว็บ | ต่อเนื่อง (ตาม scroll) | สร้างมิติลึกให้อาหารเด่น ภาพอาหารดึงความสนใจอยู่แล้ว |
| Burger "explode & stack": scroll แล้วชั้น ขนมปัง-ผัก-ชีส-เนื้อ แยกออกแล้วประกอบกลับ พร้อมชื่อวัตถุดิบ | หน้าเมนู signature | ผูกกับ scroll (GSAP ScrollTrigger) | โชว์ความสูงและชั้นของ burger ซึ่งงานวิจัยบอกว่าเพิ่มความอยาก |
| Steam / sizzle loop เบาๆ เหนือเนื้อ | hero, ภาพสินค้าหลัก | วน 2–3 วิ, ความทึบต่ำ | ให้อาหารดูร้อน |
| Fly-to-cart: ภาพเมนูหดแล้วบินเข้าไอคอนตะกร้า + badge เด้ง | ปุ่มเพิ่มลงตะกร้า | 350–450 ms | ยืนยันว่าเพิ่มแล้วโดยไม่ต้องอ่าน |
| Button press scale 0.96 | ปุ่มทุกปุ่ม | 100–150 ms | feedback ทันทีที่แตะ |
| Build-your-burger stacking: วัตถุดิบตกลงมาซ้อนแบบ spring, ราคา/แคลอรีนับขึ้น | หน้าแต่ง burger | 250–350 ms ต่อชั้น | เห็นผลลัพธ์ที่ตัวเองเลือกทันที |
| Shared-element transition (View Transitions API): การ์ดเมนูขยายเป็นหน้าสินค้า | การ์ด → หน้า product | 250–300 ms | รักษาบริบทว่ามาจากไหน |
| Bottom sheet ตัวเลือก add-on สไลด์ขึ้น | product, cart | 250 ms | เปลี่ยนจอใหญ่แต่ไม่หลุดบริบท |
| Order tracker: แถบสถานะเดินหน้า + ไอคอน (รับออเดอร์ → ย่าง → แพ็ก → ส่ง) + ไรเดอร์บนแผนที่ | หน้าติดตาม | ตาม event จริง | ลดความกังวลระหว่างรอ |
| Confetti / มงกุฎเด้งเมื่อได้แต้มหรือปลดล็อกรางวัล | loyalty | ≤ 800 ms | สร้างความรู้สึกรางวัล ใช้นานๆ ครั้ง |
| Skeleton ภาพการ์ด | ระหว่างโหลดเมนู | จนข้อมูลมา | ใช้เพื่อกัน layout กระโดด ไม่ใช่เพื่อให้รู้สึกเร็ว |

เรื่อง skeleton: งานวิจัยขัดกันเอง การทดลองของ Viget (136 คน) พบว่า skeleton ทำให้รู้สึกรอนานกว่า spinner และจอเปล่า ([Viget](https://viget.com/articles/a-bone-to-pick-with-skeleton-screens)) จึงใช้เฉพาะเพื่อความนิ่งของ layout และไม่แสดงถ้าข้อมูลมาภายใน \~300 ms

กฎบังคับ:

- รองรับ `prefers-reduced-motion`: ปิด parallax/loop ทั้งหมด เหลือแค่ fade
- animate เฉพาะ `transform` และ `opacity` เพื่อไม่ให้ INP แย่
- easing: ease-out สำหรับของที่เข้ามา, spring สำหรับของที่ผู้ใช้ลาก/วาง
- animation ห้ามบังปุ่มสั่งซื้อหรือทำให้ต้องรอก่อนกดได้

## 4. Features

แบ่ง 3 กลุ่ม: พื้นฐานทำให้ร้านขายได้, Advanced เพิ่มยอดต่อบิลและการกลับมาซื้อ, โคตรเจ๋งทำให้แบรนด์ต่างจากคู่แข่ง

### กลุ่มพื้นฐาน (MVP)

| Feature | รายละเอียด | อิงวิจัย/เหตุผล |
| --- | --- | --- |
| เมนูแยกหมวด | ไม่เกิน \~12 รายการต่อหมวด, ค้นหา, กรอง (เผ็ด/มังสวิรัติ) | choice overload |
| หน้าสินค้า + ตัวเลือก | ขนาด, ระดับสุกเนื้อ, add-on, ไม่ใส่วัตถุดิบ |  |
| ตะกร้า + Checkout | เดลิเวอรี / รับเอง / ทานที่ร้าน, นัดเวลารับ |  |
| ชำระเงิน | PromptPay QR, บัตร, เงินสดหน้าร้าน |  |
| สถานะออเดอร์ realtime | push / LINE แจ้งทุกขั้น | ลดความกังวลระหว่างรอ |
| บัญชีลูกค้า | ล็อกอิน OTP หรือ LINE Login, ที่อยู่หลายที่ |  |
| โค้ดส่วนลด | % / บาท / ส่งฟรี, ขั้นต่ำ, วันหมดอายุ | perceived value |
| ข้อมูลอาหาร | แคลอรี, สารก่อภูมิแพ้, เวลาปรุงโดยประมาณ | perceived food safety |
| Admin เมนู | เพิ่ม/แก้/ปิดขายชั่วคราว, อัปโหลดภาพ |  |
| จอครัว (KDS) | ออเดอร์เข้าทันที, จับเวลา, กดเปลี่ยนสถานะ |  |
| รายงานพื้นฐาน | ยอดขายรายวัน, เมนูขายดี, ชั่วโมงพีค |  |

### กลุ่ม Advanced

| Feature | รายละเอียด | อิงวิจัย/เหตุผล |
| --- | --- | --- |
| Build-your-burger | เลือกขนมปัง เนื้อ ชีส ผัก ซอส ทีละชั้น เห็นภาพซ้อนสด ราคา/แคลอรีอัปเดตทันที | ความสูง/ชั้นของ burger เพิ่มความอยาก |
| Smart combo / upsell ในตะกร้า | แนะนำของเสริมจากทั้งตะกร้า (มีแต่เนื้อ → เสนอเครื่องดื่ม/ฟรายส์), ไม่เกิน 1 จุดต่อขั้น | within-basket recommendation; ตัวเลข kiosk ยอดต่อบิลเพิ่มเป็นสมมติฐานให้ A/B test |
| สั่งซ้ำ 1 แตะ | "ออเดอร์ที่แล้ว" บนหน้าแรก | habit เป็นตัวทำนายการใช้ต่อ |
| Loyalty "Crowns" | สะสมแต้ม, tier, ของขวัญวันเกิด, ภารกิจ |  |
| LINE LIFF + OA | สั่งในแชท LINE, แจ้งสถานะผ่าน OA, broadcast โปรตามกลุ่ม | ช่องทางที่คนไทยใช้อยู่แล้ว |
| QR สั่งที่โต๊ะ | สแกน → สั่ง → จ่าย ผูกเลขโต๊ะ, เรียกพนักงาน |  |
| Kiosk mode | UI จอใหญ่ธีมดำ, ภาพเต็มจอ, ปุ่มใหญ่, timeout reset |  |
| สต็อกตามสูตร (BOM) | ขายแล้วตัดวัตถุดิบอัตโนมัติ, ของหมด → ปิดเมนูเอง, แจ้งเตือนจุดสั่งซื้อ |  |
| หลายสาขา | เมนู/ราคา/เวลาเปิดต่อสาขา, ส่งไปสาขาใกล้สุด |  |
| Menu engineering report | จัดเมนูเป็น Star / Plowhorse / Puzzle / Dog จากยอดขาย × กำไรต่อจาน (Kasavana & Smith) | ใช้ตัดเมนูที่ทั้งขายยากและกำไรน้อย |
| Campaign engine | Happy hour, ซื้อ X แถม Y, flash sale ตามเวลา |  |
| รีวิวพร้อมรูป | ให้คะแนนหลังได้รับของ, ตอบรีวิว | trust |
| Role & permission | เจ้าของ, ผู้จัดการ, แคชเชียร์, ครัว, ไรเดอร์ |  |

### กลุ่มโคตรเจ๋ง

| Feature | รายละเอียด |
| --- | --- |
| AI basket completion | โมเดลแบบ within-basket (แนวเดียวกับ NPA / S2SRec2) เรียนจากออเดอร์จริง + เวลา + อากาศ ให้ดีกว่ากฎ if-else |
| สั่งด้วยแชท/เสียงภาษาไทย | "เอาชีสเบอร์เกอร์ 2 อัน อันนึงไม่ใส่หัวหอม เผ็ดน้อย" → LLM แปลงเป็นตะกร้าให้ยืนยันก่อนจ่าย (ใน LINE หรือ Kiosk) |
| 3D / AR Burger | หมุนดู burger 3D, วางบนโต๊ะจริงผ่านกล้องมือถือ |
| Kitchen-load ETA | ประเมินเวลาส่งจากคิวครัวจริง + จำนวนพนักงาน, พีคหนักจะเลื่อนเวลารับอัตโนมัติแทนการรับเกินกำลัง |
| Demand forecasting | พยากรณ์ยอดรายชั่วโมง → แนะนำปริมาณเตรียมเนื้อ/ขนมปังล่วงหน้า ลดของเสีย |
| Group order | ส่งลิงก์ให้เพื่อนเพิ่มของในตะกร้าเดียว, หารบิลอัตโนมัติ |
| Community burger | ลูกค้าแต่งสูตร → โหวต → สูตรชนะขายเป็น limited edition ใส่ชื่อผู้คิด |
| Live kitchen cam | ดูกล้องครัวช่วงย่างเนื้อของออเดอร์ตัวเอง |
| Context menu ranking | สลับลำดับเมนูตามเวลา (เช้า/ดึก) และสภาพอากาศ |

แนวทางจริยธรรม: upsell ต้องเป็นทางเลือก ปิดได้ 1 แตะ ไม่ใส่ของลงตะกร้าให้เอง และไม่ใช้ตัวนับเวลาหลอกเร่งตัดสินใจ

## 5. API Design

REST (JSON) ที่ `/api/v1` สำหรับคำสั่งทั้งหมด + WebSocket สำหรับสถานะสด + webhook รับผลชำระเงิน; ทุก POST ที่สร้างเงินหรือออเดอร์ต้องส่ง `Idempotency-Key` กันกดซ้ำแล้วตัดเงินสองรอบ

**หลักการ**

- Auth: JWT access 15 นาที + refresh token (httpOnly cookie); รองรับ OTP และ LINE Login
- ราคา: server คำนวณใหม่ทุกครั้ง ไม่เชื่อราคาจาก client
- เงิน: เก็บเป็นสตางค์ (integer) `amount_satang`
- Pagination: cursor (`?cursor=&limit=`)
- Error: รูปแบบเดียว `{ "error": { "code", "message", "details" } }`
- Rate limit: ต่อผู้ใช้และต่อ IP ผ่าน Redis

**Customer API**

| Method | Path | ทำอะไร |
| --- | --- | --- |
| POST | /auth/otp/request | ขอ OTP |
| POST | /auth/otp/verify | ยืนยัน OTP ได้ token |
| POST | /auth/line | ล็อกอินด้วย LINE (LIFF id token) |
| POST | /auth/refresh | ต่ออายุ token |
| GET | /branches?lat=&lng= | สาขาใกล้, เวลาเปิด, ค่าส่ง |
| GET | /menu?branchId= | เมนูทั้งหมด (cache) พร้อมสถานะของหมด |
| GET | /menu/items/{id} | รายละเอียด, option groups, ภาพ, แคลอรี |
| GET | /builder/ingredients?branchId= | วัตถุดิบสำหรับ build-your-burger |
| GET | /carts/me | ตะกร้าปัจจุบัน |
| POST | /carts/me/items | เพิ่มของ (รวมของที่แต่งเอง) |
| PATCH | /carts/me/items/{lineId} | แก้จำนวน/ตัวเลือก |
| DELETE | /carts/me/items/{lineId} | ลบรายการ |
| POST | /carts/me/promo | ใส่โค้ดส่วนลด |
| POST | /carts/me/quote | คำนวณราคาสุทธิ, ค่าส่ง, ETA |
| GET | /recommendations?context=cart | ของเสริมที่แนะนำจากตะกร้า |
| POST | /orders | สร้างออเดอร์จากตะกร้า (ต้องมี Idempotency-Key) |
| GET | /orders?cursor= | ประวัติออเดอร์ |
| GET | /orders/{id} | รายละเอียด + สถานะ |
| POST | /orders/{id}/cancel | ยกเลิก (ได้เฉพาะก่อนครัวรับ) |
| POST | /orders/{id}/reorder | สั่งซ้ำ → ตะกร้าใหม่ |
| POST | /payments | สร้างการชำระ (PromptPay QR / บัตร) |
| GET | /payments/{id} | สถานะการชำระ |
| GET | /loyalty/me | แต้ม, tier, ภารกิจ |
| POST | /loyalty/redeem | แลกรางวัล |
| POST | /orders/{id}/review | รีวิว + รูป |
| POST | /group-orders | สร้างลิงก์สั่งรวม |
| POST | /ai/order-intent | แปลงข้อความ/เสียงเป็นตะกร้าร่าง |
| GET/POST | /me/addresses | จัดการที่อยู่ |

**Staff / Admin API** (นำหน้าด้วย `/admin`, ตรวจ role)

| Method | Path | ทำอะไร |
| --- | --- | --- |
| CRUD | /admin/menu-items, /admin/categories, /admin/option-groups | จัดการเมนู |
| PATCH | /admin/menu-items/{id}/availability | ปิด/เปิดขายต่อสาขา |
| GET | /admin/kitchen/queue?branchId= | คิวครัว |
| PATCH | /admin/orders/{id}/status | เปลี่ยนสถานะ (ครัว/แคชเชียร์) |
| POST | /admin/orders/{id}/refund | คืนเงิน |
| CRUD | /admin/ingredients, /admin/recipes | สต็อก + สูตร (BOM) |
| POST | /admin/stock-movements | รับของเข้า / ตัดของเสีย |
| CRUD | /admin/promotions, /admin/campaigns | โปรโมชัน |
| GET | /admin/reports/sales, /admin/reports/menu-engineering | รายงาน |
| GET | /admin/forecast?branchId=&date= | พยากรณ์ยอด/วัตถุดิบ |
| CRUD | /admin/staff, /admin/roles | พนักงานและสิทธิ์ |

**Webhooks (ขาเข้า)**: `POST /webhooks/payments/{provider}` ตรวจลายเซ็นทุกครั้ง แล้วอัปเดตสถานะแบบ idempotent; `POST /webhooks/line` รับข้อความจาก LINE OA

**Realtime (Socket.IO namespaces)**

| Room | Event | ใครฟัง |
| --- | --- | --- |
| `order:{id}` | `order.status_changed`, `rider.location` | ลูกค้า |
| `kitchen:{branchId}` | `order.created`, `order.cancelled` | จอครัว |
| `branch:{branchId}` | `menu.availability_changed` | ทุกหน้าจอเมนูของสาขา |
| `group:{id}` | `cart.updated` | สมาชิก group order |

**สถานะออเดอร์**

1. `PENDING_PAYMENT` → จ่ายไม่สำเร็จใน 15 นาที → `EXPIRED`
2. `PAID` → ลูกค้ายกเลิกได้ → `CANCELLED` + คืนเงิน
3. `ACCEPTED` (ครัวรับ)
4. `PREPARING`
5. `READY` (รอรับ / รอไรเดอร์)
6. `OUT_FOR_DELIVERY` (เฉพาะเดลิเวอรี)
7. `COMPLETED`

**ตัวอย่าง: สร้างออเดอร์**

```http
POST /api/v1/orders
Idempotency-Key: 7f3c9a2e-1b4d-4c8e-9a1f-2d6b8e0c4f11
Authorization: Bearer <token>
```

```json
{
  "cartId": "cart_01J9X",
  "branchId": "br_siam",
  "fulfillment": { "type": "DELIVERY", "addressId": "addr_12", "scheduledAt": null },
  "paymentMethod": "PROMPTPAY",
  "note": "ไม่เอาช้อนส้อม"
}
```

```json
{
  "id": "ord_01J9Y",
  "status": "PENDING_PAYMENT",
  "items": [
    { "name": "Fried Chicken Burger", "qty": 2, "options": ["เผ็ดกลาง", "ไม่ใส่หัวหอม"], "lineTotalSatang": 31800 }
  ],
  "totals": { "subtotalSatang": 31800, "discountSatang": 3000, "deliverySatang": 2500, "grandTotalSatang": 31300 },
  "eta": { "readyAt": "2026-10-25T18:20:00+07:00", "deliveredAt": "2026-10-25T18:40:00+07:00" },
  "payment": { "id": "pay_88", "qrPayload": "000201010212...", "expiresAt": "2026-10-25T18:15:00+07:00" }
}
```

**ตารางหลักใน DB**: users, addresses, branches, categories, menu\_items, option\_groups, options, ingredients, recipes (BOM), carts, cart\_items, orders, order\_items, order\_status\_events, payments, promotions, loyalty\_ledger, reviews, stock\_movements, staff, roles

## Roadmap

1. Phase 1 — MVP: ฟีเจอร์กลุ่มพื้นฐาน + ธีม + animation ระดับ micro-interaction + วัด Web Vitals จริง
2. Phase 2 — Advanced: Build-your-burger, LINE LIFF, QR โต๊ะ, loyalty, สต็อก BOM, upsell แบบกฎ + A/B test วัดยอดต่อบิล
3. Phase 3 — โคตรเจ๋ง: เปลี่ยน upsell เป็นโมเดล AI เมื่อมีออเดอร์พอเทรน, สั่งด้วยแชท/เสียง, 3D/AR, forecasting

สิ่งที่ต้องวัดตั้งแต่วันแรก: LCP/INP จริง, อัตรา เมนู → ตะกร้า → จ่ายสำเร็จ, ยอดต่อบิล, อัตราสั่งซ้ำใน 30 วัน

## แหล่งอ้างอิง

- [Deloitte & Google — Milliseconds Make Millions (web.dev)](https://web.dev/case-studies/milliseconds-make-millions)
- [Ichikawa et al. (2006) — Visual volume and height of food affect our appetite](https://www.jstage.jst.go.jp/article/kei1999/6/1/6_1_13/_article)
- [Frontiers in Psychology (2021) — With a Hint of Sudachi: food plating and garnish](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.699218/full)
- [Davidson et al. (2018) — Implicit attention to food images, Appetite](https://livrepository.liverpool.ac.uk/3016779/)
- [Berčík et al. (2025) — Visual presentation of food (burger) and appetite, Cogent Food & Agriculture](https://doaj.org/article/ae03c5d45ed145e0b54ebc3e6902cd0a)
- [Iyengar & Lepper (2000) — When choice is demotivating](<https://faculty.washington.edu/jdb/345/345%20Articles/Iyengar%20&%20Lepper%20(2000).pdf>)
- [Caltech (2018) — Choice overload, Nature Human Behaviour](https://camerergroup.caltech.edu/news-blog/scientists-uncover-why-you-cant-decide-what-order-lunch-83881)
- [Foroughi et al. (2024) — Continuance intention to use food delivery apps, IJCHM](https://www.emerald.com/insight/content/doi/10.1108/IJCHM-10-2022-1209/full/html)
- [Munday & Humbani (2024) — Drivers of continued food delivery app usage, Cogent Business & Management](https://doaj.org/article/57abde6039c64d219302322c4b185ac0)
- [Neural Pattern Associator (2024) — Within-basket recommendation, arXiv](https://arxiv.org/html/2401.16433v1)
- [S2SRec2 (2025) — Set-to-set basket completion, arXiv](https://arxiv.org/abs/2507.09101)
- [Viget — Skeleton screen perceived wait study](https://viget.com/articles/a-bone-to-pick-with-skeleton-screens)
- [Val Head — Animation duration (NN/g, Model Human Processor)](https://valhead.com/?p=2978)
- [Restroworks — Kiosk statistics (รายงานอุตสาหกรรม)](https://www.restroworks.com/blog/self-ordering-kiosk-restaurant-statistics/)
- [Next.js blog — release notes](https://nextjs.org/blog)
