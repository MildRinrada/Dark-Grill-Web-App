import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, Socket } from 'socket.io';
import { STAFF_ROLES, verifyAccessToken } from '../common/auth';
import { env } from '../common/env';
import { PrismaService } from '../common/prisma.service';
import { RedisService, watchErrors } from '../common/redis.service';

interface SubscribeBody {
  room: string;
  /** access token for staff rooms or signed-in customers */
  token?: string;
  /** order public token for guest order tracking */
  orderToken?: string;
}

/**
 * Rooms (from the design doc):
 *  order:{id}        order.status_changed, rider.location   customer
 *  kitchen:{branch}  order.created, order.cancelled          kitchen display
 *  branch:{branch}   menu.availability_changed               every menu screen
 *  admin             order.updated, stock.low                back office
 */
@WebSocketGateway({ cors: { origin: env.webOrigins, credentials: true } })
export class RealtimeGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('Realtime');

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  afterInit(server: Server) {
    const pub = this.redis.client.duplicate();
    const sub = this.redis.client.duplicate();
    watchErrors(pub);
    watchErrors(sub);
    server.adapter(createAdapter(pub, sub));
    this.logger.log('Socket.IO ready with Redis adapter');
  }

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: SubscribeBody) {
    const allowed = await this.canJoin(body);
    if (!allowed) return { ok: false, error: 'FORBIDDEN' };
    await socket.join(body.room);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: { room: string }) {
    await socket.leave(body.room);
    return { ok: true };
  }

  private async canJoin({ room, token, orderToken }: SubscribeBody): Promise<boolean> {
    const [kind, id] = room.split(':');
    const user = token ? verifyAccessToken(this.jwt, token) : null;
    const isStaff = !!user && STAFF_ROLES.includes(user.role);

    switch (kind) {
      case 'branch':
        return !!id;
      case 'kitchen':
        return isStaff && (user!.role === 'OWNER' || !user!.branchId || user!.branchId === id);
      case 'admin':
        return isStaff;
      case 'order': {
        if (isStaff) return true;
        const order = await this.prisma.order.findUnique({
          where: { id },
          select: { userId: true, publicToken: true },
        });
        if (!order) return false;
        return (!!user && order.userId === user.id) || (!!orderToken && order.publicToken === orderToken);
      }
      default:
        return false;
    }
  }

  emit(room: string, event: string, payload: unknown) {
    this.server?.to(room).emit(event, payload);
  }
}
