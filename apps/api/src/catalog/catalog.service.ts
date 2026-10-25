import { Injectable } from '@nestjs/common';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { bangkok, haversineKm, isWithinHours } from '../common/time';

/** Choice-overload ceiling from the design doc: show at most ~12 items per category. */
export const MAX_ITEMS_PER_CATEGORY = 12;
export const BUILDER_ITEM_ID = 'mi_build_your_own';
const MENU_TTL = 60;

type HourBand = 'morning' | 'lunch' | 'afternoon' | 'dinner' | 'late';

function hourBand(hour: number): HourBand {
  if (hour >= 6 && hour < 11) return 'morning';
  if (hour < 14 && hour >= 11) return 'lunch';
  if (hour < 17 && hour >= 14) return 'afternoon';
  if (hour < 21 && hour >= 17) return 'dinner';
  return 'late';
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async branches(near?: { lat: number; lng: number }) {
    const branches = await this.prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const rows = branches.map((b) => {
      const distanceKm = near ? haversineKm(near, b) : null;
      return {
        id: b.id,
        slug: b.slug,
        name: b.name,
        address: b.address,
        lat: b.lat,
        lng: b.lng,
        opensAt: b.opensAt,
        closesAt: b.closesAt,
        isOpen: isWithinHours(b.opensAt, b.closesAt),
        distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
        deliversHere: distanceKm === null ? null : distanceKm <= b.deliveryRadiusKm,
        deliveryFeeSatang: distanceKm === null ? b.baseDeliverySatang : deliveryFee(b, distanceKm),
      };
    });
    if (near) rows.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    return { data: rows };
  }

  async getBranch(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || !branch.isActive) throw notFound('Branch');
    return branch;
  }

  async menu(branchId: string, rank: 'default' | 'context' = 'default') {
    const cacheKey = `menu:v1:${branchId}`;
    let menu = await this.redis.getJson<MenuPayload>(cacheKey);
    if (!menu) {
      menu = await this.buildMenu(branchId);
      await this.redis.setJson(cacheKey, menu, MENU_TTL);
    }
    if (rank === 'context') {
      const band = hourBand(bangkok().hour);
      const popularity = await this.popularityByBand(branchId, band);
      return {
        ...menu,
        rankedFor: band,
        categories: menu.categories.map((c) => ({
          ...c,
          items: [...c.items].sort(
            (a, b) => Number(b.isAvailable) - Number(a.isAvailable) || (popularity[b.id] ?? 0) - (popularity[a.id] ?? 0),
          ),
        })),
      };
    }
    return menu;
  }

  private async buildMenu(branchId: string): Promise<MenuPayload> {
    const branch = await this.getBranch(branchId);
    const categories = await this.prisma.category.findMany({
      orderBy: { sort: 'asc' },
      include: {
        items: {
          where: { isArchived: false, id: { not: BUILDER_ITEM_ID } },
          orderBy: [{ sort: 'asc' }, { name: 'asc' }],
          take: MAX_ITEMS_PER_CATEGORY,
          include: {
            availability: { where: { branchId } },
            _count: { select: { optionGroups: true } },
          },
        },
      },
    });
    return {
      branch: { id: branch.id, name: branch.name, isOpen: isWithinHours(branch.opensAt, branch.closesAt) },
      categories: categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        nameEn: c.nameEn,
        icon: c.icon,
        kind: c.kind,
        items: c.items.map((i) => ({
          id: i.id,
          slug: i.slug,
          categoryId: c.id,
          name: i.name,
          nameEn: i.nameEn,
          description: i.description,
          priceSatang: i.priceSatang,
          compareAtSatang: i.compareAtSatang,
          imageUrl: i.imageUrl,
          calories: i.calories,
          allergens: i.allergens,
          prepMinutes: i.prepMinutes,
          spicyLevel: i.spicyLevel,
          isVegetarian: i.isVegetarian,
          isSignature: i.isSignature,
          hasOptions: i._count.optionGroups > 0,
          isAvailable: i.availability[0]?.isAvailable ?? true,
        })),
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  /** Units sold per item in the same time-of-day band over the last 30 days. */
  private async popularityByBand(branchId: string, band: HourBand): Promise<Record<string, number>> {
    const key = `pop:${branchId}:${band}`;
    const cached = await this.redis.getJson<Record<string, number>>(key);
    if (cached) return cached;
    const ranges: Record<HourBand, [number, number][]> = {
      morning: [[6, 11]],
      lunch: [[11, 14]],
      afternoon: [[14, 17]],
      dinner: [[17, 21]],
      late: [
        [21, 24],
        [0, 6],
      ],
    };
    const rows = await this.prisma.$queryRaw<{ menuItemId: string; units: bigint; hour: number }[]>`
      SELECT oi."menuItemId", SUM(oi.qty) AS units,
             EXTRACT(HOUR FROM (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok'))::int AS hour
      FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
      WHERE o."branchId" = ${branchId} AND o.status = 'COMPLETED'
        AND o."createdAt" > now() - interval '30 days' AND oi."menuItemId" IS NOT NULL
      GROUP BY oi."menuItemId", hour`;
    const result: Record<string, number> = {};
    for (const r of rows) {
      if (ranges[band].some(([from, to]) => r.hour >= from && r.hour < to)) {
        result[r.menuItemId] = (result[r.menuItemId] ?? 0) + Number(r.units);
      }
    }
    await this.redis.setJson(key, result, 600);
    return result;
  }

  async item(idOrSlug: string, branchId?: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], isArchived: false },
      include: {
        category: true,
        optionGroups: { orderBy: { sort: 'asc' }, include: { options: { orderBy: { sort: 'asc' } } } },
        recipe: { include: { ingredient: true } },
        availability: branchId ? { where: { branchId } } : false,
      },
    });
    if (!item) throw notFound('Menu item');
    const rating = await this.prisma.review.aggregate({
      where: { order: { items: { some: { menuItemId: item.id } } } },
      _avg: { rating: true },
      _count: true,
    });
    return {
      id: item.id,
      slug: item.slug,
      name: item.name,
      nameEn: item.nameEn,
      description: item.description,
      category: { id: item.category.id, name: item.category.name, kind: item.category.kind },
      priceSatang: item.priceSatang,
      compareAtSatang: item.compareAtSatang,
      imageUrl: item.imageUrl,
      calories: item.calories,
      allergens: item.allergens,
      prepMinutes: item.prepMinutes,
      spicyLevel: item.spicyLevel,
      isVegetarian: item.isVegetarian,
      isSignature: item.isSignature,
      isAvailable: branchId ? (item.availability?.[0]?.isAvailable ?? true) : true,
      ingredients: item.recipe.map((r) => r.ingredient.name),
      rating: { average: rating._avg.rating ? Math.round(rating._avg.rating * 10) / 10 : null, count: rating._count },
      optionGroups: item.optionGroups.map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        options: g.options.map((o) => ({
          id: o.id,
          name: o.name,
          priceDeltaSatang: o.priceDeltaSatang,
          caloriesDelta: o.caloriesDelta,
          isDefault: o.isDefault,
        })),
      })),
    };
  }

  async builderIngredients(branchId: string) {
    await this.getBranch(branchId);
    const [base, ingredients] = await Promise.all([
      this.prisma.menuItem.findUnique({ where: { id: BUILDER_ITEM_ID } }),
      this.prisma.ingredient.findMany({
        where: { isBuilder: true },
        orderBy: [{ builderSort: 'asc' }],
        include: { stock: { where: { branchId } } },
      }),
    ]);
    if (!base) throw new AppError('BUILDER_UNAVAILABLE', 'Build-your-burger is not set up', 404);
    return {
      base: { menuItemId: base.id, priceSatang: base.priceSatang, calories: base.calories, maxLayers: 10 },
      ingredients: ingredients.map((i) => ({
        id: i.id,
        name: i.name,
        nameEn: i.nameEn,
        kind: i.kind,
        priceSatang: i.builderPriceSatang,
        calories: i.builderCalories,
        color: i.builderColor,
        shape: i.builderShape,
        inStock: (i.stock[0]?.quantity ?? 0) >= 1,
      })),
    };
  }

  async invalidateMenu() {
    await this.redis.delPattern('menu:v1:*');
  }
}

export function deliveryFee(branch: { baseDeliverySatang: number; perKmSatang: number }, distanceKm: number): number {
  const extraKm = Math.max(0, Math.ceil(distanceKm) - 2);
  return branch.baseDeliverySatang + extraKm * branch.perKmSatang;
}

export interface MenuCard {
  id: string;
  slug: string;
  categoryId: string;
  name: string;
  nameEn: string;
  description: string;
  priceSatang: number;
  compareAtSatang: number | null;
  imageUrl: string;
  calories: number;
  allergens: string[];
  prepMinutes: number;
  spicyLevel: number;
  isVegetarian: boolean;
  isSignature: boolean;
  hasOptions: boolean;
  isAvailable: boolean;
}

export interface MenuPayload {
  branch: { id: string; name: string; isOpen: boolean };
  categories: {
    id: string;
    slug: string;
    name: string;
    nameEn: string;
    icon: string;
    kind: string;
    items: MenuCard[];
  }[];
  generatedAt: string;
}
