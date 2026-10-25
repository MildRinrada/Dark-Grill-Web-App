import type { Branch, Campaign, Category, FulfillmentType, Ingredient, MenuItem, Option, OptionGroup, Promotion } from '@prisma/client';
import { deliveryFee } from '../catalog/catalog.service';
import { bangkok, hhmmToMinutes } from '../common/time';

// Pure pricing engine. The server recomputes every total from catalog data and
// never trusts a price sent by a client.

export type PricedMenuItem = MenuItem & {
  category: Category;
  optionGroups: (OptionGroup & { options: Option[] })[];
  isAvailable: boolean;
};

export type PricedIngredient = Ingredient & { inStock: boolean };

export interface LineInput {
  id: string;
  menuItemId: string | null;
  qty: number;
  optionIds: string[];
  layers: string[];
  note: string | null;
}

export interface PricingInput {
  branch: Branch;
  lines: LineInput[];
  items: Map<string, PricedMenuItem>;
  ingredients: Map<string, PricedIngredient>;
  builderItemId: string;
  campaigns: Campaign[];
  promo: Promotion | null;
  promoCode: string | null;
  userId: string | null;
  fulfillment: { type: FulfillmentType; distanceKm?: number } | null;
  now: Date;
}

export interface PricedLine {
  lineId: string;
  menuItemId: string | null;
  name: string;
  imageUrl: string | null;
  categoryKind: string | null;
  qty: number;
  unitPriceSatang: number;
  lineTotalSatang: number;
  costSatang: number;
  calories: number;
  optionIds: string[];
  optionNames: string[];
  layers: { id: string; name: string; color: string | null; shape: string | null }[];
  note: string | null;
  issue: { code: string; message: string } | null;
}

export interface Quote {
  lines: PricedLine[];
  subtotalSatang: number;
  campaignDiscounts: { campaignId: string; name: string; amountSatang: number }[];
  promo: { code: string; valid: boolean; message: string; discountSatang: number } | null;
  discountSatang: number;
  deliverySatang: number;
  grandTotalSatang: number;
  costSatang: number;
  issues: { lineId?: string; code: string; message: string }[];
}

export const MAX_BUILDER_FILLINGS = 10;

export function priceCart(input: PricingInput): Quote {
  const issues: Quote['issues'] = [];
  const lines = input.lines.map((line) => priceLine(line, input));
  for (const l of lines) if (l.issue) issues.push({ lineId: l.lineId, ...l.issue });

  const valid = lines.filter((l) => !l.issue);
  const subtotal = sum(valid.map((l) => l.lineTotalSatang));
  const campaignDiscounts = applyCampaigns(valid, input.campaigns, input.now);
  const campaignTotal = sum(campaignDiscounts.map((c) => c.amountSatang));

  let delivery = 0;
  if (input.fulfillment?.type === 'DELIVERY') {
    const km = input.fulfillment.distanceKm;
    if (km === undefined) {
      issues.push({ code: 'ADDRESS_REQUIRED', message: 'Choose a delivery address' });
    } else if (km > input.branch.deliveryRadiusKm) {
      issues.push({ code: 'OUT_OF_RANGE', message: `This branch delivers within ${input.branch.deliveryRadiusKm} km` });
    } else {
      delivery = deliveryFee(input.branch, km);
    }
  }

  const promo = input.promoCode ? applyPromo(input.promo, input.promoCode, subtotal - campaignTotal, delivery, input) : null;
  const discount = Math.min(subtotal + delivery, campaignTotal + (promo?.valid ? promo.discountSatang : 0));

  return {
    lines,
    subtotalSatang: subtotal,
    campaignDiscounts,
    promo,
    discountSatang: discount,
    deliverySatang: delivery,
    grandTotalSatang: Math.max(0, subtotal - discount + delivery),
    costSatang: sum(valid.map((l) => l.costSatang)),
    issues,
  };
}

function priceLine(line: LineInput, input: PricingInput): PricedLine {
  const base: PricedLine = {
    lineId: line.id,
    menuItemId: line.menuItemId,
    name: 'Unknown item',
    imageUrl: null,
    categoryKind: null,
    qty: line.qty,
    unitPriceSatang: 0,
    lineTotalSatang: 0,
    costSatang: 0,
    calories: 0,
    optionIds: line.optionIds,
    optionNames: [],
    layers: [],
    note: line.note,
    issue: null,
  };
  const item = line.menuItemId ? input.items.get(line.menuItemId) : undefined;
  if (!item || item.isArchived) return { ...base, issue: { code: 'ITEM_NOT_FOUND', message: 'This item was removed from the menu' } };

  base.name = item.name;
  base.imageUrl = item.imageUrl;
  base.categoryKind = item.category.kind;
  if (!item.isAvailable) return { ...base, issue: { code: 'SOLD_OUT', message: `${item.name} is sold out at this branch` } };
  if (line.qty < 1 || line.qty > 20) return { ...base, issue: { code: 'QTY_INVALID', message: 'Quantity must be 1 to 20' } };

  if (item.id === input.builderItemId) return priceBuilderLine(line, item, base, input);

  // validate options against the item's groups
  const allOptions = new Map(item.optionGroups.flatMap((g) => g.options.map((o) => [o.id, { o, g }] as const)));
  for (const id of line.optionIds) {
    if (!allOptions.has(id)) return { ...base, issue: { code: 'OPTION_INVALID', message: 'An option no longer exists' } };
  }
  for (const g of item.optionGroups) {
    const chosen = line.optionIds.filter((id) => allOptions.get(id)?.g.id === g.id).length;
    if (chosen < g.minSelect || chosen > g.maxSelect) {
      return {
        ...base,
        issue: {
          code: 'OPTION_INVALID',
          message: `Choose ${g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}-${g.maxSelect}`} for ${g.name}`,
        },
      };
    }
  }
  const chosen = line.optionIds.map((id) => allOptions.get(id)!.o);
  const unit = item.priceSatang + sum(chosen.map((o) => o.priceDeltaSatang));
  const optionCost = sum(
    chosen.map((o) => {
      const ing = o.ingredientId ? input.ingredients.get(o.ingredientId) : undefined;
      return ing ? Math.round(ing.costPerUnitSatang * o.ingredientQty) : 0;
    }),
  );
  return {
    ...base,
    unitPriceSatang: unit,
    lineTotalSatang: unit * line.qty,
    costSatang: (item.costSatang + optionCost) * line.qty,
    calories: item.calories + sum(chosen.map((o) => o.caloriesDelta)),
    optionNames: chosen.map((o) => o.name),
  };
}

function priceBuilderLine(line: LineInput, item: PricedMenuItem, base: PricedLine, input: PricingInput): PricedLine {
  const layers = line.layers.map((id) => input.ingredients.get(id));
  const fail = (message: string): PricedLine => ({ ...base, issue: { code: 'BUILD_INVALID', message } });
  if (layers.some((l) => !l || !l.isBuilder)) return fail('An ingredient is not available for building');
  const [bun, ...fillings] = layers as PricedIngredient[];
  if (!bun || bun.kind !== 'BUN') return fail('Start with a bun');
  if (fillings.some((f) => f.kind === 'BUN')) return fail('Only one bun per burger');
  if (fillings.length < 1 || fillings.length > MAX_BUILDER_FILLINGS) return fail(`Add 1 to ${MAX_BUILDER_FILLINGS} layers`);
  if (!fillings.some((f) => f.kind === 'PATTY')) return fail('Add at least one patty');
  const missing = layers.find((l) => !l!.inStock);
  if (missing) return { ...base, issue: { code: 'SOLD_OUT', message: `${missing.name} is out of stock` } };

  const all = layers as PricedIngredient[];
  const unit = item.priceSatang + sum(all.map((l) => l.builderPriceSatang));
  return {
    ...base,
    name: 'เบอร์เกอร์แต่งเอง',
    unitPriceSatang: unit,
    lineTotalSatang: unit * line.qty,
    costSatang: sum(all.map((l) => l.costPerUnitSatang)) * line.qty,
    calories: item.calories + sum(all.map((l) => l.builderCalories)),
    layers: all.map((l) => ({ id: l.id, name: l.name, color: l.builderColor, shape: l.builderShape })),
  };
}

export function isCampaignLive(c: Campaign, now: Date): boolean {
  if (!c.isActive) return false;
  if (c.startsAt && now < c.startsAt) return false;
  if (c.endsAt && now > c.endsAt) return false;
  const local = bangkok(now);
  if (c.daysOfWeek.length && !c.daysOfWeek.includes(local.dayOfWeek)) return false;
  if (c.startTime && c.endTime) {
    const from = hhmmToMinutes(c.startTime);
    const to = hhmmToMinutes(c.endTime);
    if (local.minutes < from || local.minutes >= to) return false;
  }
  return true;
}

interface PercentConfig {
  percent: number;
  categoryKind?: string;
  menuItemIds?: string[];
}
interface BxgyConfig {
  menuItemId: string;
  buy: number;
  free: number;
}

function applyCampaigns(lines: PricedLine[], campaigns: Campaign[], now: Date) {
  const result: Quote['campaignDiscounts'] = [];
  for (const c of campaigns) {
    if (!isCampaignLive(c, now)) continue;
    let amount = 0;
    if (c.type === 'BUY_X_GET_Y') {
      const cfg = c.config as unknown as BxgyConfig;
      const matching = lines.filter((l) => l.menuItemId === cfg.menuItemId);
      const qty = sum(matching.map((l) => l.qty));
      const freeUnits = Math.floor(qty / (cfg.buy + cfg.free)) * cfg.free;
      const cheapest = Math.min(...matching.map((l) => l.unitPriceSatang));
      amount = freeUnits > 0 ? freeUnits * cheapest : 0;
    } else {
      const cfg = c.config as unknown as PercentConfig;
      const matching = lines.filter(
        (l) =>
          (cfg.categoryKind && l.categoryKind === cfg.categoryKind) ||
          (cfg.menuItemIds && l.menuItemId && cfg.menuItemIds.includes(l.menuItemId)),
      );
      amount = Math.round((sum(matching.map((l) => l.lineTotalSatang)) * cfg.percent) / 100);
    }
    if (amount > 0) result.push({ campaignId: c.id, name: c.name, amountSatang: amount });
  }
  return result;
}

function applyPromo(
  promo: Promotion | null,
  code: string,
  eligibleSubtotal: number,
  delivery: number,
  input: PricingInput,
): NonNullable<Quote['promo']> {
  const reject = (message: string) => ({ code, valid: false, message, discountSatang: 0 });
  if (!promo || !promo.isActive) return reject('This code does not exist');
  if (promo.startsAt && input.now < promo.startsAt) return reject('This code is not active yet');
  if (promo.endsAt && input.now > promo.endsAt) return reject('This code has expired');
  if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) return reject('This code has been fully used');
  if (promo.ownerId && promo.ownerId !== input.userId) return reject('This code belongs to another account');
  if (eligibleSubtotal < promo.minSubtotalSatang) {
    return reject(`Spend ${formatBaht(promo.minSubtotalSatang)} or more to use this code`);
  }

  let discount = 0;
  if (promo.type === 'PERCENT') {
    discount = Math.round((eligibleSubtotal * promo.value) / 100);
    if (promo.maxDiscountSatang !== null) discount = Math.min(discount, promo.maxDiscountSatang);
  } else if (promo.type === 'FIXED') {
    discount = Math.min(promo.value, eligibleSubtotal);
  } else {
    if (input.fulfillment?.type !== 'DELIVERY') return reject('Free delivery applies to delivery orders');
    discount = delivery;
  }
  return { code, valid: true, message: promo.description, discountSatang: discount };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
export const formatBaht = (satang: number) => `฿${(satang / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
