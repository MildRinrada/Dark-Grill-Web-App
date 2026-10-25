import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { normalizePhone } from '../auth/auth.service';
import { assertBranchAccess, AuthUser, CurrentUser, MANAGERS, Roles } from '../common/auth';
import { AppError, forbidden, parse } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { bangkok } from '../common/time';
import { ReportsService } from './reports.service';

const promoSchema = z.object({
  code: z.string().regex(/^[A-Z0-9-]{3,20}$/),
  description: z.string().min(1).max(120),
  type: z.enum(['PERCENT', 'FIXED', 'FREE_DELIVERY']),
  value: z.number().int().min(0),
  minSubtotalSatang: z.number().int().min(0).default(0),
  maxDiscountSatang: z.number().int().min(0).nullable().default(null),
  startsAt: z.coerce.date().nullable().default(null),
  endsAt: z.coerce.date().nullable().default(null),
  usageLimit: z.number().int().min(1).nullable().default(null),
  isActive: z.boolean().default(true),
});

const campaignSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(['HAPPY_HOUR', 'BUY_X_GET_Y', 'FLASH_SALE']),
  config: z.union([
    z.object({
      percent: z.number().int().min(1).max(90),
      categoryKind: z.string().optional(),
      menuItemIds: z.array(z.string()).optional(),
    }),
    z.object({ menuItemId: z.string(), buy: z.number().int().min(1), free: z.number().int().min(1) }),
  ]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),
  startsAt: z.coerce.date().nullable().default(null),
  endsAt: z.coerce.date().nullable().default(null),
  isActive: z.boolean().default(true),
});

@Controller('admin')
@Roles(...MANAGERS)
export class MarketingAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  @Get('promotions')
  promotions() {
    return this.prisma.promotion.findMany({ where: { ownerId: null }, orderBy: { createdAt: 'desc' } }).then((data) => ({ data }));
  }

  @Post('promotions')
  createPromotion(@Body() body: unknown) {
    const input = parse(promoSchema, body);
    if (input.type === 'PERCENT' && input.value > 90) throw new AppError('VALIDATION_ERROR', 'Percent discounts go up to 90');
    return this.prisma.promotion.create({ data: input });
  }

  @Patch('promotions/:id')
  updatePromotion(@Param('id') id: string, @Body() body: unknown) {
    return this.prisma.promotion.update({ where: { id }, data: parse(promoSchema.partial(), body) });
  }

  @Delete('promotions/:id')
  @HttpCode(204)
  async deletePromotion(@Param('id') id: string) {
    await this.prisma.promotion.update({ where: { id }, data: { isActive: false } });
  }

  @Get('campaigns')
  campaigns() {
    return this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } }).then((data) => ({ data }));
  }

  @Post('campaigns')
  createCampaign(@Body() body: unknown) {
    return this.prisma.campaign.create({ data: parse(campaignSchema, body) });
  }

  @Patch('campaigns/:id')
  updateCampaign(@Param('id') id: string, @Body() body: unknown) {
    return this.prisma.campaign.update({ where: { id }, data: parse(campaignSchema.partial(), body) });
  }

  @Delete('campaigns/:id')
  @HttpCode(204)
  async deleteCampaign(@Param('id') id: string) {
    await this.prisma.campaign.delete({ where: { id } });
  }

  @Get('reviews')
  async reviews(@Query('branchId') branchId: string, @CurrentUser() user: AuthUser) {
    assertBranchAccess(user, branchId);
    const data = await this.prisma.review.findMany({
      where: { order: { branchId } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        order: { select: { number: true, items: { select: { name: true, qty: true } } } },
        user: { select: { name: true, phone: true } },
      },
    });
    return { data };
  }

  @Post('reviews/:id/reply')
  @HttpCode(200)
  reply(@Param('id') id: string, @Body() body: unknown) {
    const { reply } = parse(z.object({ reply: z.string().min(1).max(500) }), body);
    return this.prisma.review.update({ where: { id }, data: { reply, repliedAt: new Date() } });
  }

  @Get('reports/sales')
  sales(@Query() query: unknown, @CurrentUser() user: AuthUser) {
    const q = parse(z.object({ branchId: z.string(), days: z.coerce.number().int().min(1).max(90).default(14) }), query);
    assertBranchAccess(user, q.branchId);
    return this.reports.sales(q.branchId, q.days);
  }

  @Get('reports/menu-engineering')
  engineering(@Query() query: unknown, @CurrentUser() user: AuthUser) {
    const q = parse(z.object({ branchId: z.string(), days: z.coerce.number().int().min(7).max(180).default(30) }), query);
    assertBranchAccess(user, q.branchId);
    return this.reports.menuEngineering(q.branchId, q.days);
  }

  @Get('forecast')
  forecast(@Query() query: unknown, @CurrentUser() user: AuthUser) {
    const tomorrow = bangkok(new Date(Date.now() + 86400_000)).dateKey;
    const q = parse(z.object({ branchId: z.string(), date: z.string().date().default(tomorrow) }), query);
    assertBranchAccess(user, q.branchId);
    return this.reports.forecast(q.branchId, q.date);
  }

  @Get('staff')
  async staff() {
    const data = await this.prisma.user.findMany({
      where: { role: { not: 'CUSTOMER' } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, phone: true, role: true, staffBranchId: true, createdAt: true },
    });
    return { data };
  }

  @Post('staff')
  async addStaff(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = parse(
      z.object({
        phone: z.string(),
        name: z.string().min(1).max(60),
        role: z.enum(['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'RIDER']),
        branchId: z.string().nullable(),
      }),
      body,
    );
    if (input.role === 'OWNER' && actor.role !== 'OWNER') throw forbidden('Only owners can add owners');
    const phone = normalizePhone(input.phone);
    return this.prisma.user.upsert({
      where: { phone },
      create: { phone, name: input.name, role: input.role, staffBranchId: input.branchId },
      update: { name: input.name, role: input.role, staffBranchId: input.branchId },
      select: { id: true, name: true, phone: true, role: true, staffBranchId: true },
    });
  }

  @Patch('staff/:id')
  async updateStaff(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const input = parse(
      z.object({
        role: z.enum(['CUSTOMER', 'OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'RIDER']).optional(),
        branchId: z.string().nullable().optional(),
        name: z.string().optional(),
      }),
      body,
    );
    if (input.role === 'OWNER' && actor.role !== 'OWNER') throw forbidden('Only owners can grant owner');
    if (id === actor.id && input.role && input.role !== actor.role) throw forbidden('You cannot change your own role');
    // Role changes take effect at the user's next token refresh (at most 15 minutes).
    return this.prisma.user.update({
      where: { id },
      data: { role: input.role, staffBranchId: input.branchId, name: input.name },
      select: { id: true, name: true, phone: true, role: true, staffBranchId: true },
    });
  }

  @Get('roles')
  roles() {
    return {
      data: [
        { role: 'OWNER', can: ['ทุกอย่าง รวมถึงเพิ่มเจ้าของ', 'ทุกสาขา'] },
        { role: 'MANAGER', can: ['เมนู ราคา โปรโมชัน', 'สต็อกและสูตร', 'รายงานและพยากรณ์', 'คืนเงิน', 'พนักงาน'] },
        { role: 'CASHIER', can: ['รับเงินสด', 'ดูออเดอร์', 'ส่งมอบออเดอร์', 'ยกเลิกออเดอร์'] },
        { role: 'KITCHEN', can: ['จอครัว', 'เปลี่ยนสถานะ รับ/ย่าง/พร้อม', 'ปิดเมนูที่ของหมด', 'รับของเข้า/ตัดของเสีย'] },
        { role: 'RIDER', can: ['ออกไปส่ง', 'ส่งสำเร็จ'] },
      ],
    };
  }
}
