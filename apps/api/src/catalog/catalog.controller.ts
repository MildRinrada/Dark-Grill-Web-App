import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, clientIp } from '../common/auth';
import { notFound, parse } from '../common/errors';
import { RedisService } from '../common/redis.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly realtime: RealtimeGateway,
    private readonly redis: RedisService,
  ) {}

  /** QR table: the guest taps "call staff"; the kitchen display and back office get a ping. */
  @Post('tables/call')
  @HttpCode(200)
  async callStaff(@Body() body: unknown, @Req() req: AppRequest) {
    const { branchId, tableNo, reason } = parse(
      z.object({ branchId: z.string(), tableNo: z.string().max(10), reason: z.enum(['HELP', 'BILL', 'WATER']).default('HELP') }),
      body,
    );
    const branch = await this.catalog.getBranch(branchId).catch(() => null);
    if (!branch) throw notFound('Branch');
    await this.redis.rateLimit(`tablecall:${branchId}:${tableNo}:${clientIp(req)}`, 3, 120);
    const payload = { branchId, tableNo, reason, at: new Date().toISOString() };
    this.realtime.emit(`kitchen:${branchId}`, 'table.call', payload);
    this.realtime.emit('admin', 'table.call', payload);
    return { ok: true };
  }

  @Get('branches')
  branches(@Query() query: unknown) {
    const q = parse(z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }), query);
    return this.catalog.branches(q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined);
  }

  @Get('menu')
  menu(@Query() query: unknown) {
    const q = parse(z.object({ branchId: z.string().min(1), rank: z.enum(['default', 'context']).default('default') }), query);
    return this.catalog.menu(q.branchId, q.rank);
  }

  @Get('menu/items/:id')
  item(@Param('id') id: string, @Query('branchId') branchId?: string) {
    return this.catalog.item(id, branchId);
  }

  @Get('builder/ingredients')
  builder(@Query('branchId') branchId: string) {
    return this.catalog.builderIngredients(branchId);
  }
}
