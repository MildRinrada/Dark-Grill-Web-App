import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Branch, Campaign, Promotion } from '@prisma/client';
import { classifyMenu } from '../src/admin/reports.service';
import { isCampaignLive, LineInput, PricedIngredient, PricedMenuItem, priceCart } from '../src/cart/pricing';
import { promptPayPayload } from '../src/payments/promptpay';

const branch = {
  id: 'br',
  baseDeliverySatang: 2500,
  perKmSatang: 800,
  deliveryRadiusKm: 7,
} as Branch;

const burger = {
  id: 'b',
  name: 'Burger',
  priceSatang: 15900,
  costSatang: 5000,
  calories: 600,
  imageUrl: '',
  isArchived: false,
  isAvailable: true,
  category: { kind: 'BURGER' },
  optionGroups: [
    {
      id: 'g-done',
      name: 'Doneness',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 'o-med', name: 'Medium', priceDeltaSatang: 0, caloriesDelta: 0, ingredientId: null, ingredientQty: 0 },
        { id: 'o-well', name: 'Well', priceDeltaSatang: 0, caloriesDelta: 0, ingredientId: null, ingredientQty: 0 },
      ],
    },
    {
      id: 'g-top',
      name: 'Toppings',
      minSelect: 0,
      maxSelect: 2,
      options: [{ id: 'o-cheese', name: 'Cheese', priceDeltaSatang: 2000, caloriesDelta: 70, ingredientId: 'ing-cheese', ingredientQty: 1 }],
    },
  ],
} as unknown as PricedMenuItem;

const fries = { ...burger, id: 'f', name: 'Fries', priceSatang: 5900, costSatang: 1200, category: { kind: 'SIDE' }, optionGroups: [] } as unknown as PricedMenuItem;
const drink = { ...fries, id: 'd', name: 'Juice', priceSatang: 6900, category: { kind: 'DRINK' } } as unknown as PricedMenuItem;

const ingredients = new Map<string, PricedIngredient>([
  ['ing-cheese', { id: 'ing-cheese', costPerUnitSatang: 600 } as PricedIngredient],
]);

const line = (menuItemId: string, qty: number, optionIds: string[] = []): LineInput => ({
  id: `${menuItemId}-${qty}-${optionIds.join()}`,
  menuItemId,
  qty,
  optionIds,
  layers: [],
  note: null,
});

function quote(lines: LineInput[], extra: Partial<Parameters<typeof priceCart>[0]> = {}) {
  return priceCart({
    branch,
    lines,
    items: new Map([burger, fries, drink].map((i) => [i.id, i])),
    ingredients,
    builderItemId: 'builder',
    campaigns: [],
    promo: null,
    promoCode: null,
    userId: null,
    fulfillment: null,
    now: new Date('2026-10-25T05:00:00Z'), // 12:00 Bangkok, Sunday
    ...extra,
  });
}

describe('pricing engine', () => {
  it('prices options and quantity from catalog data', () => {
    const q = quote([line('b', 2, ['o-med', 'o-cheese'])]);
    assert.equal(q.subtotalSatang, (15900 + 2000) * 2);
    assert.equal(q.costSatang, (5000 + 600) * 2);
    assert.equal(q.issues.length, 0);
  });

  it('rejects a missing required option', () => {
    const q = quote([line('b', 1)]);
    assert.equal(q.issues[0].code, 'OPTION_INVALID');
    assert.equal(q.subtotalSatang, 0);
  });

  it('rejects sold-out items', () => {
    const q = priceCart({
      ...{ branch, lines: [line('f', 1)], ingredients, builderItemId: 'x', campaigns: [], promo: null, promoCode: null, userId: null, fulfillment: null, now: new Date() },
      items: new Map([['f', { ...fries, isAvailable: false } as PricedMenuItem]]),
    });
    assert.equal(q.issues[0].code, 'SOLD_OUT');
  });

  it('applies a percent promo with a cap', () => {
    const promo = { code: 'P', type: 'PERCENT', value: 50, maxDiscountSatang: 3000, isActive: true, minSubtotalSatang: 0, usageLimit: null, usedCount: 0, startsAt: null, endsAt: null, ownerId: null, description: 'x' } as Promotion;
    const q = quote([line('f', 2)], { promo, promoCode: 'P' });
    assert.equal(q.discountSatang, 3000);
    assert.equal(q.grandTotalSatang, 5900 * 2 - 3000);
  });

  it('enforces promo minimum spend', () => {
    const promo = { code: 'P', type: 'FIXED', value: 5000, isActive: true, minSubtotalSatang: 20000, usageLimit: null, usedCount: 0, startsAt: null, endsAt: null, ownerId: null, maxDiscountSatang: null, description: 'x' } as Promotion;
    const q = quote([line('f', 1)], { promo, promoCode: 'P' });
    assert.equal(q.promo?.valid, false);
    assert.equal(q.discountSatang, 0);
  });

  it('charges delivery by distance and refuses out-of-range addresses', () => {
    const near = quote([line('f', 1)], { fulfillment: { type: 'DELIVERY', distanceKm: 4.2 } });
    assert.equal(near.deliverySatang, 2500 + 3 * 800);
    const far = quote([line('f', 1)], { fulfillment: { type: 'DELIVERY', distanceKm: 9 } });
    assert.equal(far.issues[0].code, 'OUT_OF_RANGE');
  });

  it('buy 2 get 1 gives the third unit free', () => {
    const c = { id: 'c', name: 'B2G1', type: 'BUY_X_GET_Y', config: { menuItemId: 'f', buy: 2, free: 1 }, isActive: true, daysOfWeek: [], startTime: null, endTime: null, startsAt: null, endsAt: null } as unknown as Campaign;
    const q = quote([line('f', 3)], { campaigns: [c] });
    assert.equal(q.discountSatang, 5900);
  });

  it('happy hour only runs inside its Bangkok time window', () => {
    const c = { id: 'h', name: 'HH', type: 'HAPPY_HOUR', config: { categoryKind: 'DRINK', percent: 20 }, isActive: true, daysOfWeek: [], startTime: '14:00', endTime: '17:00', startsAt: null, endsAt: null } as unknown as Campaign;
    assert.equal(isCampaignLive(c, new Date('2026-10-25T08:00:00Z')), true); // 15:00 BKK
    assert.equal(isCampaignLive(c, new Date('2026-10-25T05:00:00Z')), false); // 12:00 BKK
    const q = quote([line('d', 1)], { campaigns: [c], now: new Date('2026-10-25T08:00:00Z') });
    assert.equal(q.discountSatang, Math.round(6900 * 0.2));
  });
});

describe('menu engineering', () => {
  it('classifies items into the four Kasavana & Smith quadrants', () => {
    const r = classifyMenu([
      { id: 'star', name: 'star', qty: 100, revenueSatang: 100 * 20000, costSatang: 100 * 5000 },
      { id: 'plow', name: 'plow', qty: 100, revenueSatang: 100 * 8000, costSatang: 100 * 5000 },
      { id: 'puzzle', name: 'puzzle', qty: 10, revenueSatang: 10 * 30000, costSatang: 10 * 5000 },
      { id: 'dog', name: 'dog', qty: 10, revenueSatang: 10 * 7000, costSatang: 10 * 5000 },
    ]);
    const cls = Object.fromEntries(r.items.map((i) => [i.id, i.class]));
    assert.deepEqual(cls, { star: 'STAR', plow: 'PLOWHORSE', puzzle: 'PUZZLE', dog: 'DOG' });
  });
});

describe('PromptPay payload', () => {
  it('builds an EMVCo payload with amount and a valid CRC16', () => {
    const p = promptPayPayload('0812345678', 31300);
    assert.match(p, /^000201010212/);
    assert.ok(p.includes('5406313.00'));
    assert.ok(p.includes('0066812345678'));
    // recompute the CRC over everything before the last 4 hex digits
    let crc = 0xffff;
    const body = p.slice(0, -4);
    for (let i = 0; i < body.length; i++) {
      crc ^= body.charCodeAt(i) << 8;
      for (let b = 0; b < 8; b++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
    assert.equal(p.slice(-4), crc.toString(16).toUpperCase().padStart(4, '0'));
  });
});
