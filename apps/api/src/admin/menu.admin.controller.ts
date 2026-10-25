import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { CatalogService, MAX_ITEMS_PER_CATEGORY } from '../catalog/catalog.service';
import { assertBranchAccess, AuthUser, CurrentUser, MANAGERS, Roles } from '../common/auth';
import { AppError, notFound, parse } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const optionGroupsSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(40),
      minSelect: z.number().int().min(0).max(10),
      maxSelect: z.number().int().min(1).max(10),
      options: z
        .array(
          z.object({
            name: z.string().min(1).max(40),
            priceDeltaSatang: z.number().int().min(0).max(100000).default(0),
            caloriesDelta: z.number().int().default(0),
            isDefault: z.boolean().default(false),
            ingredientId: z.string().nullable().optional(),
            ingredientQty: z.number().default(0),
          }),
        )
        .min(1)
        .max(12),
    }),
  )
  .max(8);

const itemSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(60),
  categoryId: z.string(),
  name: z.string().min(1).max(60),
  nameEn: z.string().min(1).max(60),
  description: z.string().max(300).default(''),
  priceSatang: z.number().int().min(0).max(1_000_000),
  compareAtSatang: z.number().int().min(0).nullable().default(null),
  costSatang: z.number().int().min(0),
  imageUrl: z.string().min(1).max(300),
  calories: z.number().int().min(0).max(5000),
  allergens: z.array(z.string().max(30)).max(10).default([]),
  prepMinutes: z.number().int().min(1).max(90),
  spicyLevel: z.number().int().min(0).max(3).default(0),
  isVegetarian: z.boolean().default(false),
  isSignature: z.boolean().default(false),
  sort: z.number().int().default(0),
  aliases: z.array(z.string().max(40)).max(10).default([]),
  optionGroups: optionGroupsSchema.optional(),
});

@Controller('admin')
@Roles(...MANAGERS)
export class MenuAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get('categories')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN')
  categories() {
    return this.prisma.category
      .findMany({ orderBy: { sort: 'asc' }, include: { _count: { select: { items: { where: { isArchived: false } } } } } })
      .then((data) => ({ data }));
  }

  @Post('categories')
  async createCategory(@Body() body: unknown) {
    const input = parse(
      z.object({
        id: z.string().regex(/^cat_[a-z0-9_]+$/),
        slug: z.string().regex(/^[a-z0-9-]+$/),
        name: z.string().min(1),
        nameEn: z.string().min(1),
        icon: z.string().max(30),
        sort: z.number().int(),
        kind: z.enum(['BURGER', 'SIDE', 'DRINK', 'COMBO']),
      }),
      body,
    );
    const created = await this.prisma.category.create({ data: input });
    await this.catalog.invalidateMenu();
    return created;
  }

  @Patch('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() body: unknown) {
    const input = parse(
      z.object({
        name: z.string().min(1).optional(),
        nameEn: z.string().optional(),
        icon: z.string().optional(),
        sort: z.number().int().optional(),
      }),
      body,
    );
    const updated = await this.prisma.category.update({ where: { id }, data: input });
    await this.catalog.invalidateMenu();
    return updated;
  }

  @Delete('categories/:id')
  @HttpCode(204)
  async deleteCategory(@Param('id') id: string) {
    const items = await this.prisma.menuItem.count({ where: { categoryId: id, isArchived: false } });
    if (items) throw new AppError('CATEGORY_NOT_EMPTY', 'Move or archive the items in this category first', 409);
    await this.prisma.category.delete({ where: { id } });
    await this.catalog.invalidateMenu();
  }

  @Get('menu-items')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN')
  async items(@Query('branchId') branchId?: string) {
    const items = await this.prisma.menuItem.findMany({
      orderBy: [{ categoryId: 'asc' }, { sort: 'asc' }],
      include: {
        category: { select: { id: true, name: true, kind: true } },
        availability: branchId ? { where: { branchId } } : false,
        optionGroups: { orderBy: { sort: 'asc' }, include: { options: { orderBy: { sort: 'asc' } } } },
        recipe: { include: { ingredient: { select: { id: true, name: true, unit: true } } } },
      },
    });
    return {
      data: items.map((i) => ({
        ...i,
        isAvailable: branchId ? (i.availability?.[0]?.isAvailable ?? true) : null,
        autoDisabled: branchId ? (i.availability?.[0]?.autoDisabled ?? false) : null,
        availability: undefined,
      })),
    };
  }

  private async assertRoom(categoryId: string, excludeId?: string) {
    const count = await this.prisma.menuItem.count({
      where: { categoryId, isArchived: false, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (count >= MAX_ITEMS_PER_CATEGORY) {
      throw new AppError(
        'CATEGORY_FULL',
        `A category shows at most ${MAX_ITEMS_PER_CATEGORY} items. Archive one or use another category.`,
        409,
      );
    }
  }

  @Post('menu-items')
  async create(@Body() body: unknown) {
    const { optionGroups, ...input } = parse(itemSchema, body);
    await this.assertRoom(input.categoryId);
    const id = `mi_${input.slug.replace(/-/g, '_')}`;
    const item = await this.prisma.menuItem.create({
      data: { id, ...input, optionGroups: optionGroups ? { create: this.groupsCreate(optionGroups) } : undefined },
    });
    await this.catalog.invalidateMenu();
    return item;
  }

  @Patch('menu-items/:id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const { optionGroups, ...input } = parse(itemSchema.partial(), body);
    const current = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!current) throw notFound('Menu item');
    if (input.categoryId && input.categoryId !== current.categoryId) await this.assertRoom(input.categoryId, id);
    const item = await this.prisma.$transaction(async (tx) => {
      if (optionGroups) {
        await tx.optionGroup.deleteMany({ where: { menuItemId: id } });
        for (const g of this.groupsCreate(optionGroups)) await tx.optionGroup.create({ data: { ...g, menuItemId: id } });
      }
      return tx.menuItem.update({ where: { id }, data: input });
    });
    await this.catalog.invalidateMenu();
    return item;
  }

  @Delete('menu-items/:id')
  @HttpCode(204)
  async archive(@Param('id') id: string) {
    await this.prisma.menuItem.update({ where: { id }, data: { isArchived: true } });
    await this.catalog.invalidateMenu();
  }

  @Post('menu-items/:id/restore')
  @HttpCode(200)
  async restore(@Param('id') id: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) throw notFound('Menu item');
    await this.assertRoom(item.categoryId, id);
    await this.prisma.menuItem.update({ where: { id }, data: { isArchived: false } });
    await this.catalog.invalidateMenu();
    return { ok: true };
  }

  /** Manual on/off per branch. Kitchen staff can 86 an item too. */
  @Patch('menu-items/:id/availability')
  @Roles('OWNER', 'MANAGER', 'KITCHEN')
  async availability(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { branchId, isAvailable } = parse(z.object({ branchId: z.string(), isAvailable: z.boolean() }), body);
    assertBranchAccess(user, branchId);
    await this.prisma.menuAvailability.upsert({
      where: { branchId_menuItemId: { branchId, menuItemId: id } },
      create: { branchId, menuItemId: id, isAvailable, autoDisabled: false },
      update: { isAvailable, autoDisabled: false },
    });
    await this.catalog.invalidateMenu();
    this.realtime.emit(`branch:${branchId}`, 'menu.availability_changed', { branchId, changes: [{ menuItemId: id, isAvailable }] });
    return { menuItemId: id, branchId, isAvailable };
  }

  @Get('recipes/:menuItemId')
  recipe(@Param('menuItemId') menuItemId: string) {
    return this.prisma.recipeLine.findMany({ where: { menuItemId }, include: { ingredient: true } }).then((data) => ({ data }));
  }

  @Put('recipes/:menuItemId')
  async setRecipe(@Param('menuItemId') menuItemId: string, @Body() body: unknown) {
    const { lines } = parse(z.object({ lines: z.array(z.object({ ingredientId: z.string(), qty: z.number().positive() })).max(30) }), body);
    await this.prisma.$transaction([
      this.prisma.recipeLine.deleteMany({ where: { menuItemId } }),
      this.prisma.recipeLine.createMany({ data: lines.map((l) => ({ ...l, menuItemId })) }),
    ]);
    return this.recipe(menuItemId);
  }

  private groupsCreate(groups: z.infer<typeof optionGroupsSchema>) {
    return groups.map((g, gi) => ({
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: Math.max(g.minSelect, g.maxSelect),
      sort: gi,
      options: {
        create: g.options.map((o, oi) => ({
          name: o.name,
          priceDeltaSatang: o.priceDeltaSatang,
          caloriesDelta: o.caloriesDelta,
          isDefault: o.isDefault,
          ingredientId: o.ingredientId ?? null,
          ingredientQty: o.ingredientQty,
          sort: oi,
        })),
      },
    }));
  }
}
