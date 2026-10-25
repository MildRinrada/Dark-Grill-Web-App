/* Seeds a realistic demo shop: 3 branches, menu, BOM recipes, stock, promotions,
 * staff for every role, a demo customer, and 60 days of order history so reports,
 * recommendations, menu engineering and the forecast have real data to work on. */
import { Channel, FulfillmentType, IngredientKind, OrderStatus, Prisma, PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import 'dotenv/config';

const prisma = new PrismaClient();
const img = (name: string) => `/images/menu/${name}.jpg`;
const baht = (n: number) => Math.round(n * 100);

// deterministic PRNG so every seed produces the same history
let state = 20261025;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const pick = <T>(rows: [T, number][]): T => {
  const total = rows.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [v, w] of rows) if ((r -= w) <= 0) return v;
  return rows[rows.length - 1][0];
};

const branches = [
  {
    id: 'br_siam',
    slug: 'siam',
    name: 'สาขาสยาม',
    address: 'สยามสแควร์ ซอย 7 ปทุมวัน กรุงเทพฯ',
    lat: 13.7455,
    lng: 100.534,
    kitchenStaff: 4,
    weight: 1,
  },
  {
    id: 'br_ari',
    slug: 'ari',
    name: 'สาขาอารีย์',
    address: 'ซอยอารีย์ 1 พญาไท กรุงเทพฯ',
    lat: 13.7797,
    lng: 100.5446,
    kitchenStaff: 3,
    weight: 0.6,
  },
  {
    id: 'br_thonglor',
    slug: 'thonglor',
    name: 'สาขาทองหล่อ',
    address: 'ทองหล่อ ซอย 13 วัฒนา กรุงเทพฯ',
    lat: 13.7325,
    lng: 100.583,
    kitchenStaff: 3,
    weight: 0.75,
  },
];

const categories = [
  { id: 'cat_signature', slug: 'signature', name: 'ซิกเนเจอร์', nameEn: 'Signature', icon: 'flame', sort: 1, kind: 'BURGER' },
  { id: 'cat_burger', slug: 'burgers', name: 'เบอร์เกอร์', nameEn: 'Burgers', icon: 'beef', sort: 2, kind: 'BURGER' },
  { id: 'cat_combo', slug: 'combos', name: 'คอมโบ', nameEn: 'Combos', icon: 'package', sort: 3, kind: 'COMBO' },
  { id: 'cat_side', slug: 'sides', name: 'ของทานเล่น', nameEn: 'Sides', icon: 'drumstick', sort: 4, kind: 'SIDE' },
  { id: 'cat_drink', slug: 'drinks', name: 'เครื่องดื่ม', nameEn: 'Drinks', icon: 'cup-soda', sort: 5, kind: 'DRINK' },
];

type Ing = {
  id: string;
  name: string;
  nameEn: string;
  unit: string;
  kind: IngredientKind;
  cost: number;
  builder?: { price: number; cal: number; color: string; shape: string; sort: number };
  stock: number;
  reorder: number;
};
const ingredients: Ing[] = [
  {
    id: 'ing_bun_brioche',
    name: 'ขนมปังบริยอช',
    nameEn: 'Brioche bun',
    unit: 'ชิ้น',
    kind: 'BUN',
    cost: 800,
    builder: { price: 0, cal: 210, color: '#E3A04F', shape: 'bun', sort: 1 },
    stock: 260,
    reorder: 40,
  },
  {
    id: 'ing_bun_sesame',
    name: 'ขนมปังงา',
    nameEn: 'Sesame bun',
    unit: 'ชิ้น',
    kind: 'BUN',
    cost: 700,
    builder: { price: 0, cal: 200, color: '#D9963F', shape: 'bun', sort: 2 },
    stock: 220,
    reorder: 40,
  },
  {
    id: 'ing_bun_charcoal',
    name: 'ขนมปังชาร์โคล',
    nameEn: 'Charcoal bun',
    unit: 'ชิ้น',
    kind: 'BUN',
    cost: 1200,
    builder: { price: 2000, cal: 190, color: '#2E2A28', shape: 'bun', sort: 3 },
    stock: 60,
    reorder: 15,
  },
  {
    id: 'ing_beef_patty',
    name: 'เนื้อวัวสแมช',
    nameEn: 'Smashed beef patty',
    unit: 'ชิ้น',
    kind: 'PATTY',
    cost: 3500,
    builder: { price: 6900, cal: 290, color: '#6B3A22', shape: 'patty', sort: 10 },
    stock: 320,
    reorder: 60,
  },
  {
    id: 'ing_wagyu_patty',
    name: 'เนื้อวากิว',
    nameEn: 'Wagyu patty',
    unit: 'ชิ้น',
    kind: 'PATTY',
    cost: 8000,
    builder: { price: 14900, cal: 340, color: '#5A2E1A', shape: 'patty', sort: 11 },
    stock: 7,
    reorder: 10,
  },
  {
    id: 'ing_chicken_fillet',
    name: 'ไก่ทอดกรอบ',
    nameEn: 'Crispy chicken',
    unit: 'ชิ้น',
    kind: 'PATTY',
    cost: 2500,
    builder: { price: 5500, cal: 310, color: '#C9822F', shape: 'patty', sort: 12 },
    stock: 140,
    reorder: 30,
  },
  {
    id: 'ing_plant_patty',
    name: 'แพลนต์เบส',
    nameEn: 'Plant-based patty',
    unit: 'ชิ้น',
    kind: 'PATTY',
    cost: 4000,
    builder: { price: 6900, cal: 250, color: '#5E3D2A', shape: 'patty', sort: 13 },
    stock: 50,
    reorder: 12,
  },
  {
    id: 'ing_cheddar',
    name: 'เชดดาร์ชีส',
    nameEn: 'Cheddar',
    unit: 'แผ่น',
    kind: 'CHEESE',
    cost: 600,
    builder: { price: 2000, cal: 70, color: '#F7B32B', shape: 'cheese', sort: 20 },
    stock: 500,
    reorder: 80,
  },
  {
    id: 'ing_pepper_jack',
    name: 'เปปเปอร์แจ็คชีส',
    nameEn: 'Pepper jack',
    unit: 'แผ่น',
    kind: 'CHEESE',
    cost: 800,
    builder: { price: 2500, cal: 80, color: '#F1D37A', shape: 'cheese', sort: 21 },
    stock: 200,
    reorder: 40,
  },
  {
    id: 'ing_lettuce',
    name: 'ผักกาดแก้ว',
    nameEn: 'Lettuce',
    unit: 'ใบ',
    kind: 'VEG',
    cost: 200,
    builder: { price: 500, cal: 5, color: '#5DBB4C', shape: 'leaf', sort: 30 },
    stock: 600,
    reorder: 100,
  },
  {
    id: 'ing_tomato',
    name: 'มะเขือเทศ',
    nameEn: 'Tomato',
    unit: 'แว่น',
    kind: 'VEG',
    cost: 300,
    builder: { price: 500, cal: 5, color: '#E5381B', shape: 'slice', sort: 31 },
    stock: 500,
    reorder: 100,
  },
  {
    id: 'ing_onion',
    name: 'หัวหอมแดง',
    nameEn: 'Red onion',
    unit: 'แว่น',
    kind: 'VEG',
    cost: 150,
    builder: { price: 500, cal: 8, color: '#B7679B', shape: 'ring', sort: 32 },
    stock: 500,
    reorder: 100,
  },
  {
    id: 'ing_pickle',
    name: 'แตงกวาดอง',
    nameEn: 'Pickles',
    unit: 'ชุด',
    kind: 'VEG',
    cost: 200,
    builder: { price: 500, cal: 4, color: '#7FA34A', shape: 'slice', sort: 33 },
    stock: 400,
    reorder: 80,
  },
  {
    id: 'ing_jalapeno',
    name: 'พริกฮาลาเปโน',
    nameEn: 'Jalapeño',
    unit: 'ชุด',
    kind: 'VEG',
    cost: 250,
    builder: { price: 1000, cal: 4, color: '#3E8E41', shape: 'ring', sort: 34 },
    stock: 260,
    reorder: 50,
  },
  {
    id: 'ing_bacon',
    name: 'เบคอนรมควัน',
    nameEn: 'Smoked bacon',
    unit: 'ชิ้น',
    kind: 'EXTRA',
    cost: 1500,
    builder: { price: 3500, cal: 90, color: '#B5462F', shape: 'strip', sort: 40 },
    stock: 300,
    reorder: 60,
  },
  {
    id: 'ing_egg',
    name: 'ไข่ดาว',
    nameEn: 'Fried egg',
    unit: 'ฟอง',
    kind: 'EXTRA',
    cost: 600,
    builder: { price: 1500, cal: 90, color: '#FFF6EC', shape: 'egg', sort: 41 },
    stock: 180,
    reorder: 40,
  },
  {
    id: 'ing_mushroom',
    name: 'เห็ดย่าง',
    nameEn: 'Grilled mushroom',
    unit: 'ชุด',
    kind: 'EXTRA',
    cost: 800,
    builder: { price: 2000, cal: 30, color: '#8A6A4E', shape: 'slice', sort: 42 },
    stock: 150,
    reorder: 30,
  },
  {
    id: 'ing_sauce_house',
    name: 'ซอสเฮาส์',
    nameEn: 'House sauce',
    unit: 'ที่',
    kind: 'SAUCE',
    cost: 300,
    builder: { price: 0, cal: 60, color: '#F08A3C', shape: 'sauce', sort: 50 },
    stock: 800,
    reorder: 120,
  },
  {
    id: 'ing_sauce_bbq',
    name: 'ซอสบาร์บีคิว',
    nameEn: 'BBQ sauce',
    unit: 'ที่',
    kind: 'SAUCE',
    cost: 300,
    builder: { price: 0, cal: 50, color: '#7A2A12', shape: 'sauce', sort: 51 },
    stock: 600,
    reorder: 100,
  },
  {
    id: 'ing_sauce_spicy',
    name: 'สไปซี่มาโย',
    nameEn: 'Spicy mayo',
    unit: 'ที่',
    kind: 'SAUCE',
    cost: 300,
    builder: { price: 500, cal: 70, color: '#FF8A00', shape: 'sauce', sort: 52 },
    stock: 600,
    reorder: 100,
  },
  { id: 'ing_fries', name: 'มันฝรั่งทอด', nameEn: 'Fries', unit: 'ที่', kind: 'OTHER', cost: 1200, stock: 500, reorder: 80 },
  {
    id: 'ing_truffle',
    name: 'ทรัฟเฟิลและพาร์เมซาน',
    nameEn: 'Truffle & parmesan',
    unit: 'ที่',
    kind: 'OTHER',
    cost: 2200,
    stock: 120,
    reorder: 25,
  },
  { id: 'ing_cajun', name: 'ผงเคจัน', nameEn: 'Cajun spice', unit: 'ที่', kind: 'OTHER', cost: 200, stock: 300, reorder: 50 },
  {
    id: 'ing_tender',
    name: 'ไก่เทนเดอร์ 4 ชิ้น',
    nameEn: 'Chicken tenders',
    unit: 'ชุด',
    kind: 'OTHER',
    cost: 3800,
    stock: 150,
    reorder: 30,
  },
  {
    id: 'ing_icecream',
    name: 'ไอศกรีมวานิลลา',
    nameEn: 'Vanilla ice cream',
    unit: 'ถ้วย',
    kind: 'OTHER',
    cost: 1800,
    stock: 260,
    reorder: 50,
  },
  {
    id: 'ing_cookie',
    name: 'คุกกี้ช็อกโกแลต',
    nameEn: 'Chocolate cookie',
    unit: 'ชิ้น',
    kind: 'OTHER',
    cost: 600,
    stock: 200,
    reorder: 40,
  },
  {
    id: 'ing_strawberry',
    name: 'สตรอว์เบอร์รีสด',
    nameEn: 'Strawberries',
    unit: 'ที่',
    kind: 'OTHER',
    cost: 1500,
    stock: 160,
    reorder: 30,
  },
  { id: 'ing_orange', name: 'ส้มสายน้ำผึ้ง', nameEn: 'Oranges', unit: 'แก้ว', kind: 'OTHER', cost: 2400, stock: 200, reorder: 40 },
  { id: 'ing_box', name: 'กล่องและถุงกระดาษ', nameEn: 'Packaging', unit: 'ชุด', kind: 'OTHER', cost: 500, stock: 2000, reorder: 300 },
];
const ingCost = new Map(ingredients.map((i) => [i.id, i.cost]));

const DONENESS = {
  name: 'ระดับความสุก',
  min: 1,
  max: 1,
  options: [
    ['มีเดียม', 0, 0, true],
    ['มีเดียมเวล', 0, 0],
    ['เวลดัน', 0, 0],
  ],
};
const SPICE = {
  name: 'ความเผ็ด',
  min: 1,
  max: 1,
  options: [
    ['ไม่เผ็ด', 0, 0, true],
    ['เผ็ดน้อย', 0, 0],
    ['เผ็ดกลาง', 0, 0],
    ['เผ็ดมาก', 0, 0],
  ],
};
const TOPPINGS = {
  name: 'เพิ่มท็อปปิ้ง',
  min: 0,
  max: 4,
  options: [
    ['เพิ่มชีส', 2000, 70, false, 'ing_cheddar', 1],
    ['เพิ่มเบคอน', 3500, 90, false, 'ing_bacon', 1],
    ['เพิ่มไข่ดาว', 1500, 90, false, 'ing_egg', 1],
    ['เพิ่มเนื้อ', 6900, 290, false, 'ing_beef_patty', 1],
  ],
};
const HOLD = {
  name: 'ไม่ใส่',
  min: 0,
  max: 4,
  options: [
    ['ไม่ใส่หัวหอม', 0, -8, false, 'ing_onion', -1],
    ['ไม่ใส่ผักกาด', 0, -5, false, 'ing_lettuce', -1],
    ['ไม่ใส่มะเขือเทศ', 0, -5, false, 'ing_tomato', -1],
    ['ไม่ใส่ผักดอง', 0, -4, false, 'ing_pickle', -1],
  ],
};
const SIZE = {
  name: 'ขนาด',
  min: 1,
  max: 1,
  options: [
    ['ปกติ', 0, 0, true],
    ['ใหญ่', 2000, 160, false, 'ing_fries', 0.5],
  ],
};
const SHAKE_SIZE = {
  name: 'ขนาด',
  min: 1,
  max: 1,
  options: [
    ['ปกติ', 0, 0, true],
    ['ใหญ่', 2000, 180, false, 'ing_icecream', 0.5],
  ],
};
const COMBO_DRINK = {
  name: 'เครื่องดื่มในชุด',
  min: 1,
  max: 1,
  options: [
    ['น้ำส้มคั้นสด', 0, 110, true, 'ing_orange', 1],
    ['สตรอว์เบอร์รีเชค', 2500, 380, false, 'ing_strawberry', 1],
    ['คุกกี้แอนด์ครีมเชค', 2900, 520, false, 'ing_icecream', 1],
  ],
};

type GroupDef = { name: string; min: number; max: number; options: (string | number | boolean)[][] };
type ItemDef = {
  id: string;
  cat: string;
  name: string;
  nameEn: string;
  desc: string;
  price: number;
  compareAt?: number;
  image: string;
  cal: number;
  allergens: string[];
  prep: number;
  spicy?: number;
  veg?: boolean;
  signature?: boolean;
  aliases?: string[];
  recipe: [string, number][];
  groups?: GroupDef[];
  weight: number;
};

const items: ItemDef[] = [
  {
    id: 'mi_fire_grill',
    cat: 'cat_signature',
    name: 'ไฟร์กริลล์ ซิกเนเจอร์',
    nameEn: 'Fire Grill Signature',
    desc: 'เนื้อสแมชสองชั้นย่างไฟแรง เชดดาร์ละลาย ฮาลาเปโน สไปซี่มาโย ในบริยอชปิ้งเนย',
    price: 249,
    compareAt: 279,
    image: 'hero-fire-grill',
    cal: 820,
    allergens: ['กลูเตน', 'นม', 'ไข่'],
    prep: 12,
    spicy: 1,
    signature: true,
    aliases: ['ไฟร์กริลล์', 'fire grill', 'ซิกเนเจอร์'],
    recipe: [
      ['ing_bun_brioche', 1],
      ['ing_beef_patty', 2],
      ['ing_cheddar', 2],
      ['ing_jalapeno', 1],
      ['ing_onion', 1],
      ['ing_lettuce', 1],
      ['ing_sauce_spicy', 1],
      ['ing_box', 1],
    ],
    groups: [DONENESS, SPICE, TOPPINGS, HOLD],
    weight: 16,
  },
  {
    id: 'mi_bacon_bbq_tower',
    cat: 'cat_signature',
    name: 'เบคอนบาร์บีคิว ทาวเวอร์',
    nameEn: 'Bacon BBQ Tower',
    desc: 'เนื้อสองชั้น เบคอนรมควันกรอบ ซอสบาร์บีคิวเคี่ยวเอง หัวหอมย่าง สูงเต็มมือ',
    price: 269,
    image: 'bacon-bbq-tower',
    cal: 980,
    allergens: ['กลูเตน', 'นม'],
    prep: 13,
    aliases: ['เบคอนบาร์บีคิว', 'bbq tower', 'ทาวเวอร์'],
    recipe: [
      ['ing_bun_brioche', 1],
      ['ing_beef_patty', 2],
      ['ing_bacon', 2],
      ['ing_cheddar', 1],
      ['ing_onion', 1],
      ['ing_sauce_bbq', 1],
      ['ing_box', 1],
    ],
    groups: [DONENESS, TOPPINGS, HOLD],
    weight: 9,
  },
  {
    id: 'mi_melty_cheese_bomb',
    cat: 'cat_signature',
    name: 'ชีสบอมบ์ลาวา',
    nameEn: 'Melty Cheese Bomb',
    desc: 'ราดชีสลาวาร้อนๆ ทับเนื้อสแมช แฮมรมควัน และไข่ดาว',
    price: 239,
    image: 'melty-cheese-bomb',
    cal: 910,
    allergens: ['กลูเตน', 'นม', 'ไข่'],
    prep: 12,
    aliases: ['ชีสบอมบ์', 'cheese bomb', 'ลาวา'],
    recipe: [
      ['ing_bun_brioche', 1],
      ['ing_beef_patty', 1],
      ['ing_cheddar', 3],
      ['ing_egg', 1],
      ['ing_bacon', 1],
      ['ing_box', 1],
    ],
    groups: [DONENESS, TOPPINGS, HOLD],
    weight: 8,
  },
  {
    id: 'mi_charcoal_wagyu',
    cat: 'cat_signature',
    name: 'ชาร์โคลบัน วากิว',
    nameEn: 'Charcoal Wagyu',
    desc: 'เนื้อวากิวหนานุ่มในขนมปังชาร์โคล เห็ดย่าง เปปเปอร์แจ็ค ผักสด',
    price: 329,
    image: 'charcoal-bun',
    cal: 760,
    allergens: ['กลูเตน', 'นม'],
    prep: 15,
    aliases: ['วากิว', 'wagyu', 'ชาร์โคล'],
    recipe: [
      ['ing_bun_charcoal', 1],
      ['ing_wagyu_patty', 1],
      ['ing_pepper_jack', 1],
      ['ing_mushroom', 1],
      ['ing_lettuce', 1],
      ['ing_box', 1],
    ],
    groups: [DONENESS, HOLD],
    weight: 3,
  },
  {
    id: 'mi_classic_smash',
    cat: 'cat_burger',
    name: 'คลาสสิกสแมช',
    nameEn: 'Classic Smash',
    desc: 'เนื้อสแมชขอบกรอบ เชดดาร์ ผักกาด มะเขือเทศ ซอสเฮาส์ สูตรต้นตำรับของร้าน',
    price: 159,
    image: 'classic-smash',
    cal: 620,
    allergens: ['กลูเตน', 'นม'],
    prep: 9,
    aliases: ['คลาสสิก', 'สแมช', 'classic'],
    recipe: [
      ['ing_bun_sesame', 1],
      ['ing_beef_patty', 1],
      ['ing_cheddar', 1],
      ['ing_lettuce', 1],
      ['ing_tomato', 1],
      ['ing_sauce_house', 1],
      ['ing_box', 1],
    ],
    groups: [DONENESS, TOPPINGS, HOLD],
    weight: 20,
  },
  {
    id: 'mi_double_cheese',
    cat: 'cat_burger',
    name: 'ดับเบิลชีสสแตก',
    nameEn: 'Double Cheese Stack',
    desc: 'เนื้อสองชั้น ชีสสองแผ่น แตงกวาดอง หัวหอม ซอสเฮาส์ เรียบง่ายแต่แน่น',
    price: 199,
    compareAt: 219,
    image: 'double-cheese-stack',
    cal: 840,
    allergens: ['กลูเตน', 'นม'],
    prep: 10,
    aliases: ['ดับเบิลชีส', 'double cheese'],
    recipe: [
      ['ing_bun_brioche', 1],
      ['ing_beef_patty', 2],
      ['ing_cheddar', 2],
      ['ing_pickle', 1],
      ['ing_onion', 1],
      ['ing_sauce_house', 1],
      ['ing_box', 1],
    ],
    groups: [DONENESS, TOPPINGS, HOLD],
    weight: 15,
  },
  {
    id: 'mi_cheeseburger',
    cat: 'cat_burger',
    name: 'ชีสเบอร์เกอร์',
    nameEn: 'Cheeseburger',
    desc: 'เนื้อหนึ่งชั้น เชดดาร์ ผักกาด มะเขือเทศ หัวหอม ขนาดพอดีมื้อ',
    price: 139,
    image: 'classic-cheese',
    cal: 560,
    allergens: ['กลูเตน', 'นม'],
    prep: 8,
    aliases: ['ชีสเบอร์เกอร์', 'cheeseburger', 'cheese burger'],
    recipe: [
      ['ing_bun_sesame', 1],
      ['ing_beef_patty', 1],
      ['ing_cheddar', 1],
      ['ing_lettuce', 1],
      ['ing_tomato', 1],
      ['ing_onion', 1],
      ['ing_box', 1],
    ],
    groups: [DONENESS, SPICE, TOPPINGS, HOLD],
    weight: 18,
  },
  {
    id: 'mi_fried_chicken',
    cat: 'cat_burger',
    name: 'ไก่ทอดเบอร์เกอร์',
    nameEn: 'Fried Chicken Burger',
    desc: 'สะโพกไก่ทอดกรอบสองรอบ สไปซี่มาโย ผักกาด แตงกวาดอง',
    price: 159,
    image: 'fried-chicken',
    cal: 690,
    allergens: ['กลูเตน', 'ไข่'],
    prep: 11,
    spicy: 2,
    aliases: ['ไก่ทอด', 'เบอร์เกอร์ไก่', 'fried chicken'],
    recipe: [
      ['ing_bun_brioche', 1],
      ['ing_chicken_fillet', 1],
      ['ing_sauce_spicy', 1],
      ['ing_lettuce', 1],
      ['ing_pickle', 1],
      ['ing_box', 1],
    ],
    groups: [SPICE, TOPPINGS, HOLD],
    weight: 14,
  },
  {
    id: 'mi_smoky_pickle',
    cat: 'cat_burger',
    name: 'สโมกกี้ดับเบิลพิกเคิล',
    nameEn: 'Smoky Double Pickle',
    desc: 'เนื้อสองชั้นรมควัน ชีสละลาย แตงกวาดองเต็มคำ เปรี้ยวตัดมัน',
    price: 219,
    image: 'smoky-pickle',
    cal: 870,
    allergens: ['กลูเตน', 'นม'],
    prep: 11,
    aliases: ['สโมกกี้', 'พิกเคิล', 'smoky'],
    recipe: [
      ['ing_bun_brioche', 1],
      ['ing_beef_patty', 2],
      ['ing_cheddar', 2],
      ['ing_pickle', 2],
      ['ing_sauce_bbq', 1],
      ['ing_box', 1],
    ],
    groups: [DONENESS, TOPPINGS, HOLD],
    weight: 4,
  },
  {
    id: 'mi_garden_beef',
    cat: 'cat_burger',
    name: 'การ์เด้นบีฟ',
    nameEn: 'Garden Beef',
    desc: 'เนื้อหนึ่งชั้นกับผักสดจัดเต็ม หัวหอมแดง มะเขือเทศ ผักกาด สดชื่น',
    price: 169,
    image: 'garden-beef',
    cal: 590,
    allergens: ['กลูเตน'],
    prep: 9,
    aliases: ['การ์เด้น', 'garden beef'],
    recipe: [
      ['ing_bun_sesame', 1],
      ['ing_beef_patty', 1],
      ['ing_lettuce', 2],
      ['ing_tomato', 2],
      ['ing_onion', 1],
      ['ing_sauce_house', 1],
      ['ing_box', 1],
    ],
    groups: [DONENESS, TOPPINGS, HOLD],
    weight: 3,
  },
  {
    id: 'mi_veggie_garden',
    cat: 'cat_burger',
    name: 'เวจจี้การ์เด้น',
    nameEn: 'Veggie Garden',
    desc: 'แพลนต์เบสย่าง ผักสด มะเขือเทศ ซอสเฮาส์ ไม่มีเนื้อสัตว์',
    price: 179,
    image: 'veggie-garden',
    cal: 520,
    allergens: ['กลูเตน', 'ถั่วเหลือง'],
    prep: 10,
    veg: true,
    aliases: ['เวจจี้', 'มังสวิรัติ', 'veggie', 'แพลนต์เบส'],
    recipe: [
      ['ing_bun_sesame', 1],
      ['ing_plant_patty', 1],
      ['ing_lettuce', 2],
      ['ing_tomato', 1],
      ['ing_sauce_house', 1],
      ['ing_box', 1],
    ],
    groups: [HOLD],
    weight: 2,
  },
  {
    id: 'mi_build_your_own',
    cat: 'cat_burger',
    name: 'แต่งเบอร์เกอร์เอง',
    nameEn: 'Build Your Burger',
    desc: 'เลือกขนมปัง เนื้อ ชีส ผัก ซอส ได้ทีละชั้น',
    price: 59,
    image: 'build-float',
    cal: 0,
    allergens: [],
    prep: 12,
    aliases: ['แต่งเอง', 'build'],
    recipe: [],
    weight: 3,
  },
  {
    id: 'mi_combo_duo',
    cat: 'cat_combo',
    name: 'คอมโบดูโอ',
    nameEn: 'Duo Combo',
    desc: 'คลาสสิกสแมช คู่เฟรนช์ฟรายส์ทอดใหม่',
    price: 199,
    compareAt: 218,
    image: 'combo-duo',
    cal: 940,
    allergens: ['กลูเตน', 'นม'],
    prep: 10,
    aliases: ['คอมโบดูโอ', 'duo'],
    recipe: [
      ['ing_bun_sesame', 1],
      ['ing_beef_patty', 1],
      ['ing_cheddar', 1],
      ['ing_lettuce', 1],
      ['ing_tomato', 1],
      ['ing_fries', 1],
      ['ing_box', 1],
    ],
    groups: [DONENESS, HOLD],
    weight: 10,
  },
  {
    id: 'mi_combo_grill',
    cat: 'cat_combo',
    name: 'คอมโบกริลล์',
    nameEn: 'Grill Combo',
    desc: 'ดับเบิลชีสสแตก เฟรนช์ฟรายส์ และเครื่องดื่มเลือกได้',
    price: 259,
    compareAt: 297,
    image: 'combo-grill',
    cal: 1260,
    allergens: ['กลูเตน', 'นม'],
    prep: 11,
    aliases: ['คอมโบกริลล์', 'grill combo'],
    recipe: [
      ['ing_bun_brioche', 1],
      ['ing_beef_patty', 2],
      ['ing_cheddar', 2],
      ['ing_pickle', 1],
      ['ing_fries', 1],
      ['ing_box', 1],
    ],
    groups: [DONENESS, COMBO_DRINK, HOLD],
    weight: 9,
  },
  {
    id: 'mi_combo_basket',
    cat: 'cat_combo',
    name: 'คอมโบบาสเก็ต',
    nameEn: 'Basket Combo',
    desc: 'เบอร์เกอร์บนเขียงไม้ ฟรายส์ในตะกร้า แบ่งกันกินสองคนได้',
    price: 279,
    image: 'combo-basket',
    cal: 1180,
    allergens: ['กลูเตน', 'นม'],
    prep: 12,
    aliases: ['บาสเก็ต', 'basket'],
    recipe: [
      ['ing_bun_brioche', 1],
      ['ing_beef_patty', 2],
      ['ing_cheddar', 1],
      ['ing_lettuce', 1],
      ['ing_fries', 2],
      ['ing_box', 1],
    ],
    groups: [DONENESS, HOLD],
    weight: 4,
  },
  {
    id: 'mi_fries_classic',
    cat: 'cat_side',
    name: 'เฟรนช์ฟรายส์',
    nameEn: 'Classic Fries',
    desc: 'มันฝรั่งทอดสองรอบ กรอบนอกนุ่มใน โรยเกลือทะเล',
    price: 59,
    image: 'fries-classic',
    cal: 320,
    allergens: [],
    prep: 5,
    veg: true,
    aliases: ['เฟรนช์ฟรายส์', 'ฟรายส์', 'มันฝรั่ง', 'fries'],
    recipe: [['ing_fries', 1]],
    groups: [SIZE],
    weight: 30,
  },
  {
    id: 'mi_fries_truffle',
    cat: 'cat_side',
    name: 'ทรัฟเฟิลพาร์เมซานฟรายส์',
    nameEn: 'Truffle Parmesan Fries',
    desc: 'ฟรายส์คลุกน้ำมันทรัฟเฟิล พาร์เมซานขูดสด และพาร์สลีย์',
    price: 99,
    image: 'fries-truffle',
    cal: 410,
    allergens: ['นม'],
    prep: 6,
    veg: true,
    aliases: ['ทรัฟเฟิล', 'truffle fries'],
    recipe: [
      ['ing_fries', 1],
      ['ing_truffle', 1],
    ],
    groups: [SIZE],
    weight: 8,
  },
  {
    id: 'mi_fries_party',
    cat: 'cat_side',
    name: 'ฟรายส์ถาดปาร์ตี้',
    nameEn: 'Party Fries Tray',
    desc: 'ฟรายส์ถาดใหญ่สำหรับ 3-4 คน พร้อมซอส 2 แบบ',
    price: 149,
    image: 'fries-tray',
    cal: 980,
    allergens: [],
    prep: 7,
    veg: true,
    aliases: ['ถาดปาร์ตี้', 'party fries'],
    recipe: [
      ['ing_fries', 3],
      ['ing_sauce_house', 1],
      ['ing_sauce_bbq', 1],
    ],
    weight: 4,
  },
  {
    id: 'mi_fries_cajun',
    cat: 'cat_side',
    name: 'เคจันฟรายส์',
    nameEn: 'Cajun Fries',
    desc: 'ฟรายส์คลุกผงเคจันเผ็ดหอม เสิร์ฟในตะกร้าเหล็ก',
    price: 69,
    image: 'fries-dark',
    cal: 340,
    allergens: [],
    prep: 5,
    spicy: 1,
    veg: true,
    aliases: ['เคจัน', 'cajun'],
    recipe: [
      ['ing_fries', 1],
      ['ing_cajun', 1],
    ],
    groups: [SIZE],
    weight: 9,
  },
  {
    id: 'mi_chicken_tenders',
    cat: 'cat_side',
    name: 'ไก่เทนเดอร์',
    nameEn: 'Chicken Tenders',
    desc: 'อกไก่ชุบเกล็ดขนมปังทอด 4 ชิ้น พร้อมดิปครีมกระเทียม',
    price: 119,
    image: 'chicken-tenders',
    cal: 460,
    allergens: ['กลูเตน', 'ไข่', 'นม'],
    prep: 8,
    aliases: ['เทนเดอร์', 'tenders', 'ไก่ชุบ'],
    recipe: [
      ['ing_tender', 1],
      ['ing_sauce_house', 1],
    ],
    weight: 10,
  },
  {
    id: 'mi_shake_cookie',
    cat: 'cat_drink',
    name: 'คุกกี้แอนด์ครีมเชค',
    nameEn: 'Cookies & Cream Shake',
    desc: 'มิลค์เชควานิลลาปั่นคุกกี้ช็อกโกแลต วิปครีม ราดซอสช็อก',
    price: 99,
    image: 'shake-cookie',
    cal: 520,
    allergens: ['นม', 'กลูเตน'],
    prep: 4,
    veg: true,
    aliases: ['คุกกี้เชค', 'คุกกี้แอนด์ครีม', 'shake', 'มิลค์เชค'],
    recipe: [
      ['ing_icecream', 1],
      ['ing_cookie', 1],
    ],
    groups: [SHAKE_SIZE],
    weight: 10,
  },
  {
    id: 'mi_shake_strawberry',
    cat: 'cat_drink',
    name: 'สตรอว์เบอร์รีเชค',
    nameEn: 'Strawberry Shake',
    desc: 'สตรอว์เบอร์รีสดปั่นกับไอศกรีมวานิลลา',
    price: 95,
    image: 'shake-strawberry',
    cal: 380,
    allergens: ['นม'],
    prep: 4,
    veg: true,
    aliases: ['สตรอว์เบอร์รี', 'strawberry'],
    recipe: [
      ['ing_icecream', 1],
      ['ing_strawberry', 1],
    ],
    groups: [SHAKE_SIZE],
    weight: 6,
  },
  {
    id: 'mi_orange_juice',
    cat: 'cat_drink',
    name: 'น้ำส้มคั้นสด',
    nameEn: 'Fresh Orange Juice',
    desc: 'ส้มสายน้ำผึ้งคั้นสดทุกแก้ว ไม่เติมน้ำตาล',
    price: 69,
    image: 'orange-juice',
    cal: 110,
    allergens: [],
    prep: 3,
    veg: true,
    aliases: ['น้ำส้ม', 'orange juice', 'ส้มคั้น'],
    recipe: [['ing_orange', 1]],
    weight: 12,
  },
];

const recipeCost = (recipe: [string, number][]) => recipe.reduce((a, [id, q]) => a + (ingCost.get(id) ?? 0) * q, 0);

async function main() {
  console.log('Resetting tables...');
  await prisma.$executeRawUnsafe(`TRUNCATE "Review","LoyaltyLedger","OrderStatusEvent","Payment","OrderItem","Order","CartItem","Cart",
    "StockMovement","BranchIngredient","RecipeLine","Option","OptionGroup","MenuAvailability","MenuItem","Category","Ingredient",
    "Promotion","Campaign","Reward","Address","RefreshToken","OtpCode","User","Branch","WebhookEvent","IdempotencyRecord" CASCADE`);

  for (const b of branches) {
    await prisma.branch.create({
      data: {
        id: b.id,
        slug: b.slug,
        name: b.name,
        address: b.address,
        lat: b.lat,
        lng: b.lng,
        opensAt: '10:00',
        closesAt: '22:00',
        baseDeliverySatang: baht(25),
        perKmSatang: baht(8),
        deliveryRadiusKm: 7,
        kitchenStaff: b.kitchenStaff,
      },
    });
  }
  await prisma.category.createMany({ data: categories });
  await prisma.ingredient.createMany({
    data: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      nameEn: i.nameEn,
      unit: i.unit,
      kind: i.kind,
      costPerUnitSatang: i.cost,
      isBuilder: !!i.builder,
      builderPriceSatang: i.builder?.price ?? 0,
      builderCalories: i.builder?.cal ?? 0,
      builderColor: i.builder?.color,
      builderShape: i.builder?.shape,
      builderSort: i.builder?.sort ?? 0,
    })),
  });
  for (const b of branches) {
    await prisma.branchIngredient.createMany({
      data: ingredients.map((i) => ({
        branchId: b.id,
        ingredientId: i.id,
        reorderPoint: i.reorder,
        quantity: b.id === 'br_siam' ? i.stock : Math.round(i.stock * 0.8) + 10,
      })),
    });
  }

  for (const [sort, it] of items.entries()) {
    await prisma.menuItem.create({
      data: {
        id: it.id,
        slug: it.id.replace(/^mi_/, '').replace(/_/g, '-'),
        categoryId: it.cat,
        name: it.name,
        nameEn: it.nameEn,
        description: it.desc,
        priceSatang: baht(it.price),
        compareAtSatang: it.compareAt ? baht(it.compareAt) : null,
        costSatang: recipeCost(it.recipe),
        imageUrl: img(it.image),
        calories: it.cal,
        allergens: it.allergens,
        prepMinutes: it.prep,
        spicyLevel: it.spicy ?? 0,
        isVegetarian: !!it.veg,
        isSignature: !!it.signature,
        sort,
        aliases: it.aliases ?? [],
        recipe: { create: it.recipe.map(([ingredientId, qty]) => ({ ingredientId, qty })) },
        optionGroups: {
          create: (it.groups ?? []).map((g, gi) => ({
            name: g.name,
            minSelect: g.min,
            maxSelect: g.max,
            sort: gi,
            options: {
              create: g.options.map(([name, price, cal, isDefault, ingredientId, ingredientQty], oi) => ({
                name: name as string,
                priceDeltaSatang: price as number,
                caloriesDelta: cal as number,
                isDefault: !!isDefault,
                ingredientId: (ingredientId as string) ?? null,
                ingredientQty: (ingredientQty as number) ?? 0,
                sort: oi,
              })),
            },
          })),
        },
      },
    });
  }

  await prisma.promotion.createMany({
    data: [
      { code: 'WELCOME50', description: 'ลด 50 บาทเมื่อสั่งครบ 200 บาท', type: 'FIXED', value: baht(50), minSubtotalSatang: baht(200) },
      { code: 'GRILL10', description: 'ลด 10% สูงสุด 60 บาท', type: 'PERCENT', value: 10, maxDiscountSatang: baht(60) },
      { code: 'FREESHIP', description: 'ส่งฟรีเมื่อสั่งครบ 300 บาท', type: 'FREE_DELIVERY', value: 0, minSubtotalSatang: baht(300) },
      { code: 'LASTONE', description: 'ลด 30 บาท เหลือสิทธิ์ 1 ครั้ง', type: 'FIXED', value: baht(30), usageLimit: 1 },
    ],
  });
  await prisma.campaign.createMany({
    data: [
      {
        name: 'Happy Hour เครื่องดื่มลด 20%',
        type: 'HAPPY_HOUR',
        config: { categoryKind: 'DRINK', percent: 20 },
        daysOfWeek: [],
        startTime: '14:00',
        endTime: '17:00',
      },
      {
        name: 'เฟรนช์ฟรายส์ ซื้อ 2 แถม 1',
        type: 'BUY_X_GET_Y',
        config: { menuItemId: 'mi_fries_classic', buy: 2, free: 1 },
        daysOfWeek: [],
      },
    ],
  });
  await prisma.reward.createMany({
    data: [
      {
        id: 'rw_free_delivery',
        name: 'ส่งฟรี 1 ครั้ง',
        description: 'ใช้กับออเดอร์เดลิเวอรี',
        costCrowns: 80,
        type: 'FREE_DELIVERY',
        value: 0,
      },
      { id: 'rw_free_fries', name: 'เฟรนช์ฟรายส์ฟรี', description: 'ส่วนลด 59 บาท', costCrowns: 150, type: 'FIXED', value: baht(59) },
      { id: 'rw_50_off', name: 'ส่วนลด 100 บาท', description: 'ใช้ได้กับทุกเมนู', costCrowns: 300, type: 'FIXED', value: baht(100) },
    ],
  });

  // staff for every role + a demo customer
  const staff = [
    ['0800000001', 'คุณเจ้าของ', 'OWNER', null],
    ['0800000002', 'ผู้จัดการสยาม', 'MANAGER', 'br_siam'],
    ['0800000003', 'แคชเชียร์สยาม', 'CASHIER', 'br_siam'],
    ['0800000004', 'ครัวสยาม', 'KITCHEN', 'br_siam'],
    ['0800000005', 'ไรเดอร์สยาม', 'RIDER', 'br_siam'],
  ] as const;
  for (const [phone, name, role, branchId] of staff) {
    await prisma.user.create({ data: { phone, name, role, staffBranchId: branchId } });
  }
  const demo = await prisma.user.create({ data: { phone: '0811111111', name: 'ลูกค้าตัวอย่าง', birthday: new Date('1995-03-14') } });
  await prisma.address.createMany({
    data: [
      { userId: demo.id, label: 'บ้าน', line1: 'คอนโดใกล้ BTS ราชเทวี ถนนเพชรบุรี', lat: 13.7516, lng: 100.5316, isDefault: true },
      { userId: demo.id, label: 'ที่ทำงาน', line1: 'อาคารสำนักงาน ถนนพระราม 4 สีลม', lat: 13.7286, lng: 100.5341 },
    ],
  });
  const customers = await Promise.all(
    Array.from({ length: 160 }, (_, i) =>
      prisma.user.create({ data: { phone: `08${String(20000000 + i).padStart(8, '0')}`, name: `ลูกค้า ${i + 1}` } }),
    ),
  );

  await seedHistory(
    demo.id,
    customers.map((c) => c.id),
  );
  console.log('Seed complete.');
}

async function seedHistory(demoId: string, customerIds: string[]) {
  const byKind = (kind: string) =>
    items.filter((i) => categories.find((c) => c.id === i.cat)?.kind === kind && i.id !== 'mi_build_your_own');
  const mains = [...byKind('BURGER'), ...byKind('COMBO')];
  const sides = byKind('SIDE');
  const drinks = byKind('DRINK');
  const hourWeights: [number, number][] = [
    [10, 3],
    [11, 8],
    [12, 14],
    [13, 11],
    [14, 5],
    [15, 4],
    [16, 5],
    [17, 8],
    [18, 13],
    [19, 14],
    [20, 10],
    [21, 5],
  ];
  const channels: [Channel, number][] = [
    ['WEB', 45],
    ['LINE', 25],
    ['QR', 15],
    ['KIOSK', 15],
  ];

  const orders: Prisma.OrderCreateManyInput[] = [];
  const orderItems: Prisma.OrderItemCreateManyInput[] = [];
  const events: Prisma.OrderStatusEventCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const reviews: Prisma.ReviewCreateManyInput[] = [];
  const ledger: Prisma.LoyaltyLedgerCreateManyInput[] = [];
  const now = Date.now();
  let demoOrders = 0;

  for (let daysAgo = 60; daysAgo >= 1; daysAgo--) {
    const day = new Date(now - daysAgo * 86400_000);
    const dateKey = new Date(day.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    const weekday = new Date(`${dateKey}T12:00:00+07:00`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    for (const b of branches) {
      const count = Math.round(38 * b.weight * (weekend ? 1.3 : 1) * (0.85 + rand() * 0.3));
      for (let n = 0; n < count; n++) {
        const hour = pick(hourWeights);
        const createdAt = new Date(
          `${dateKey}T${String(hour).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00+07:00`,
        );
        const channel = pick(channels);
        const fulfillment: FulfillmentType =
          channel === 'QR'
            ? 'DINE_IN'
            : channel === 'KIOSK'
              ? pick([
                  ['DINE_IN', 6],
                  ['PICKUP', 4],
                ])
              : pick([
                  ['DELIVERY', 6],
                  ['PICKUP', 4],
                ]);
        const isDemo = b.id === 'br_siam' && rand() < 0.012 && channel !== 'KIOSK';
        const userId = channel === 'KIOSK' ? null : isDemo ? demoId : customerIds[Math.floor(rand() * customerIds.length)];
        const id = randomUUID();

        const basket: { it: ItemDef; qty: number }[] = [];
        const mainCount = rand() < 0.3 ? 2 : 1;
        for (let m = 0; m < mainCount; m++)
          basket.push({ it: pick(mains.map((i) => [i, i.weight] as [ItemDef, number])), qty: rand() < 0.15 ? 2 : 1 });
        const hasCombo = basket.some((x) => x.it.cat === 'cat_combo');
        if (!hasCombo && rand() < 0.7) basket.push({ it: pick(sides.map((i) => [i, i.weight] as [ItemDef, number])), qty: 1 });
        if (!hasCombo && rand() < 0.55) basket.push({ it: pick(drinks.map((i) => [i, i.weight] as [ItemDef, number])), qty: 1 });

        let subtotal = 0;
        let cost = 0;
        for (const { it, qty } of basket) {
          const unit = baht(it.price);
          const unitCost = recipeCost(it.recipe);
          subtotal += unit * qty;
          cost += unitCost * qty;
          orderItems.push({
            orderId: id,
            menuItemId: it.id,
            name: it.name,
            imageUrl: img(it.image),
            qty,
            unitPriceSatang: unit,
            lineTotalSatang: unit * qty,
            costSatang: unitCost * qty,
            optionIds: [],
            optionNames: [],
            layers: [],
          });
        }
        const delivery = fulfillment === 'DELIVERY' ? baht(25 + Math.floor(rand() * 4) * 8) : 0;
        const discount = rand() < 0.12 ? Math.min(baht(50), Math.round(subtotal * 0.1)) : 0;
        const grand = subtotal - discount + delivery;
        const status: OrderStatus = rand() < 0.04 ? 'CANCELLED' : 'COMPLETED';
        const crowns = status === 'COMPLETED' && userId ? Math.floor(grand / 1000) : 0;
        orders.push({
          id,
          number: `H${dateKey.replace(/-/g, '').slice(2)}${b.slug.slice(0, 2).toUpperCase()}${String(n).padStart(3, '0')}`,
          publicToken: randomBytes(12).toString('base64url'),
          userId,
          branchId: b.id,
          channel,
          status,
          fulfillmentType: fulfillment,
          tableNo: fulfillment === 'DINE_IN' && channel === 'QR' ? String(1 + Math.floor(rand() * 16)) : null,
          subtotalSatang: subtotal,
          discountSatang: discount,
          deliverySatang: delivery,
          grandTotalSatang: grand,
          costSatang: cost,
          crownsEarned: crowns,
          stockDeducted: true,
          createdAt,
          updatedAt: new Date(createdAt.getTime() + 35 * 60_000),
          etaReadyAt: new Date(createdAt.getTime() + 15 * 60_000),
        });
        const steps: OrderStatus[] =
          status === 'CANCELLED'
            ? ['PENDING_PAYMENT', 'PAID', 'CANCELLED']
            : [
                'PENDING_PAYMENT',
                'PAID',
                'ACCEPTED',
                'PREPARING',
                'READY',
                ...(fulfillment === 'DELIVERY' ? (['OUT_FOR_DELIVERY'] as OrderStatus[]) : []),
                'COMPLETED',
              ];
        steps.forEach((s, i) => events.push({ orderId: id, status: s, at: new Date(createdAt.getTime() + i * 4 * 60_000) }));
        const method =
          channel === 'KIOSK' && rand() < 0.4
            ? 'CASH'
            : pick([
                ['PROMPTPAY', 7],
                ['CARD', 3],
              ] as ['PROMPTPAY' | 'CARD', number][]);
        payments.push({
          orderId: id,
          method,
          status: status === 'CANCELLED' ? 'REFUNDED' : 'SUCCEEDED',
          amountSatang: grand,
          provider: method === 'CASH' ? 'counter' : 'mockpay',
          paidAt: new Date(createdAt.getTime() + 60_000),
          createdAt,
        });
        if (crowns && userId)
          ledger.push({ userId, delta: crowns, reason: 'EARN', orderId: id, createdAt: new Date(createdAt.getTime() + 40 * 60_000) });
        if (status === 'COMPLETED' && userId && rand() < 0.12) {
          const rating = pick([
            [5, 60],
            [4, 28],
            [3, 8],
            [2, 3],
            [1, 1],
          ] as [number, number][]);
          const comments: Record<number, string[]> = {
            5: ['เนื้อฉ่ำมาก ขอบกรอบอร่อย', 'ส่งไวมาก ยังร้อนอยู่เลย', 'ฟรายส์กรอบทั้งกล่อง'],
            4: ['อร่อย แต่วันนี้รอนานนิดนึง', 'ซอสดี อยากให้มีไซส์ใหญ่กว่านี้'],
            3: ['โอเค แต่ขนมปังนิ่มไปหน่อย'],
            2: ['ได้ของไม่ครบ ขาดซอส'],
            1: ['เย็นแล้วตอนได้รับ'],
          };
          reviews.push({
            orderId: id,
            userId,
            rating,
            comment: comments[rating][Math.floor(rand() * comments[rating].length)],
            createdAt: new Date(createdAt.getTime() + 2 * 3600_000),
          });
        }
        if (isDemo) demoOrders++;
      }
    }
  }

  const chunk = async <T>(rows: T[], fn: (part: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 2000) await fn(rows.slice(i, i + 2000));
  };
  await chunk(orders, (d) => prisma.order.createMany({ data: d }));
  await chunk(orderItems, (d) => prisma.orderItem.createMany({ data: d }));
  await chunk(events, (d) => prisma.orderStatusEvent.createMany({ data: d }));
  await chunk(payments, (d) => prisma.payment.createMany({ data: d }));
  await chunk(reviews, (d) => prisma.review.createMany({ data: d }));
  await chunk(ledger, (d) => prisma.loyaltyLedger.createMany({ data: d }));
  console.log(
    `History: ${orders.length} orders, ${orderItems.length} lines, ${reviews.length} reviews, demo customer ${demoOrders} orders`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
