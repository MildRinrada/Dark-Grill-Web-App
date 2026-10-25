import { Injectable } from '@nestjs/common';
import type { Order, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { BUILDER_ITEM_ID } from '../catalog/catalog.service';
import { AppError, notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { startOfBangkokMonth } from '../common/time';

/** 1 Crown for every 10 baht paid. */
export const SATANG_PER_CROWN = 1000;

const TIERS = [
  { name: 'Bronze', min: 0 },
  { name: 'Silver', min: 500 },
  { name: 'Gold', min: 1500 },
] as const;

const MISSIONS = [
  { id: 'monthly-3', title: 'สั่ง 3 ครั้งในเดือนนี้', target: 3, reward: 50 },
  { id: 'first-build', title: 'ลองแต่งเบอร์เกอร์เองครั้งแรก', target: 1, reward: 30 },
] as const;

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  private async balance(userId: string, db: Prisma.TransactionClient = this.prisma) {
    const agg = await db.loyaltyLedger.aggregate({ where: { userId }, _sum: { delta: true } });
    return agg._sum.delta ?? 0;
  }

  private async lifetime(userId: string) {
    const agg = await this.prisma.loyaltyLedger.aggregate({
      where: { userId, delta: { gt: 0 } },
      _sum: { delta: true },
    });
    return agg._sum.delta ?? 0;
  }

  /** Called when an order completes. Returns crowns earned including any mission bonus. */
  async earnForOrder(db: Prisma.TransactionClient, order: Order) {
    if (!order.userId || order.crownsEarned > 0) return 0;
    const crowns = Math.floor(order.grandTotalSatang / SATANG_PER_CROWN);
    if (crowns > 0) {
      await db.loyaltyLedger.create({ data: { userId: order.userId, delta: crowns, reason: 'EARN', orderId: order.id } });
    }
    let bonus = 0;
    for (const m of await this.missionProgress(order.userId, db)) {
      if (m.progress >= m.target && !m.claimed) {
        await db.loyaltyLedger.create({
          data: { userId: order.userId, delta: m.reward, reason: 'MISSION', note: m.id, orderId: order.id },
        });
        bonus += m.reward;
      }
    }
    await db.order.update({ where: { id: order.id }, data: { crownsEarned: crowns + bonus } });
    return crowns + bonus;
  }

  async reverseForOrder(db: Prisma.TransactionClient, order: Order) {
    if (!order.userId || order.crownsEarned <= 0) return;
    await db.loyaltyLedger.create({
      data: { userId: order.userId, delta: -order.crownsEarned, reason: 'REVERSAL', orderId: order.id },
    });
    await db.order.update({ where: { id: order.id }, data: { crownsEarned: 0 } });
  }

  private async missionProgress(userId: string, db: Prisma.TransactionClient = this.prisma) {
    const monthStart = startOfBangkokMonth();
    const [monthly, builds, claimed] = await Promise.all([
      db.order.count({ where: { userId, status: 'COMPLETED', createdAt: { gte: monthStart } } }),
      db.orderItem.count({ where: { menuItemId: BUILDER_ITEM_ID, order: { userId, status: 'COMPLETED' } } }),
      db.loyaltyLedger.findMany({ where: { userId, reason: 'MISSION' }, select: { note: true, createdAt: true } }),
    ]);
    return MISSIONS.map((m) => {
      const progress = m.id === 'monthly-3' ? monthly : Math.min(builds, 1);
      const wasClaimed =
        m.id === 'monthly-3' ? claimed.some((c) => c.note === m.id && c.createdAt >= monthStart) : claimed.some((c) => c.note === m.id);
      return { ...m, progress: Math.min(progress, m.target), claimed: wasClaimed };
    });
  }

  async summary(userId: string) {
    const [balance, lifetime, missions, rewards, history] = await Promise.all([
      this.balance(userId),
      this.lifetime(userId),
      this.missionProgress(userId),
      this.prisma.reward.findMany({ where: { isActive: true }, orderBy: { costCrowns: 'asc' } }),
      this.prisma.loyaltyLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    const tierIndex = TIERS.findLastIndex((t) => lifetime >= t.min);
    const next = TIERS[tierIndex + 1];
    return {
      balance,
      lifetime,
      tier: TIERS[tierIndex].name,
      nextTier: next ? { name: next.name, crownsNeeded: next.min - lifetime } : null,
      missions,
      rewards: rewards.map((r) => ({ ...r, affordable: balance >= r.costCrowns })),
      history,
    };
  }

  async redeem(userId: string, rewardId: string) {
    const reward = await this.prisma.reward.findUnique({ where: { id: rewardId } });
    if (!reward?.isActive) throw notFound('Reward');
    return this.prisma.$transaction(
      async (tx) => {
        const balance = await this.balance(userId, tx);
        if (balance < reward.costCrowns) {
          throw new AppError('NOT_ENOUGH_CROWNS', 'Not enough Crowns for this reward', 409, { balance });
        }
        const code = `CRWN-${randomBytes(3).toString('hex').toUpperCase()}`;
        const promo = await tx.promotion.create({
          data: {
            code,
            description: reward.name,
            type: reward.type,
            value: reward.value,
            usageLimit: 1,
            ownerId: userId,
            endsAt: new Date(Date.now() + 30 * 86400_000),
          },
        });
        await tx.loyaltyLedger.create({
          data: { userId, delta: -reward.costCrowns, reason: 'REDEEM', note: `${reward.name} (${code})` },
        });
        return { code: promo.code, expiresAt: promo.endsAt, balance: balance - reward.costCrowns };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
