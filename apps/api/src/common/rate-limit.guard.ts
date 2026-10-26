import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppRequest, clientIp, INTERNAL_CLIENT, isInternalCall } from './auth';
import { RedisService } from './redis.service';

/** Per-user (or per-IP for guests) request ceiling for the whole API. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (req.path.startsWith('/api/v1/webhooks')) return true;
    const ip = clientIp(req);
    // server-rendered pages all come from the web host's few IPs, so they skip the per-IP ceiling
    if (ip !== INTERNAL_CLIENT && !isInternalCall(req)) await this.redis.rateLimit(`ip:${ip}`, 600, 60);
    if (req.user) await this.redis.rateLimit(`user:${req.user.id}`, 300, 60);
    return true;
  }
}
