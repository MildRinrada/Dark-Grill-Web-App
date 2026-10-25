import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Authenticated, AuthUser, CurrentUser } from '../common/auth';
import { notFound, parse } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { LoyaltyService } from './loyalty.service';

@Controller()
@Authenticated()
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { id: u.id, phone: u.phone, name: u.name, role: u.role, birthday: u.birthday, branchId: u.staffBranchId };
  }

  @Patch('me')
  async update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parse(z.object({ name: z.string().min(1).max(60).optional(), birthday: z.string().date().nullable().optional() }), body);
    const u = await this.prisma.user.update({
      where: { id: user.id },
      data: { name: input.name, birthday: input.birthday === undefined ? undefined : input.birthday ? new Date(input.birthday) : null },
    });
    return { id: u.id, phone: u.phone, name: u.name, role: u.role, birthday: u.birthday };
  }

  @Get('me/addresses')
  addresses(@CurrentUser() user: AuthUser) {
    return this.prisma.address
      .findMany({ where: { userId: user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] })
      .then((data) => ({ data }));
  }

  @Post('me/addresses')
  async addAddress(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parse(
      z.object({
        label: z.string().min(1).max(30),
        line1: z.string().min(3).max(200),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        note: z.string().max(140).optional(),
        isDefault: z.boolean().default(false),
      }),
      body,
    );
    const count = await this.prisma.address.count({ where: { userId: user.id } });
    if (input.isDefault || count === 0) {
      await this.prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    }
    return this.prisma.address.create({ data: { ...input, isDefault: input.isDefault || count === 0, userId: user.id } });
  }

  @Delete('me/addresses/:id')
  @HttpCode(204)
  async removeAddress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const removed = await this.prisma.address.deleteMany({ where: { id, userId: user.id } });
    if (removed.count === 0) throw notFound('Address');
  }

  @Get('loyalty/me')
  summary(@CurrentUser() user: AuthUser) {
    return this.loyalty.summary(user.id);
  }

  @Post('loyalty/redeem')
  @HttpCode(200)
  redeem(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { rewardId } = parse(z.object({ rewardId: z.string() }), body);
    return this.loyalty.redeem(user.id, rewardId);
  }
}
