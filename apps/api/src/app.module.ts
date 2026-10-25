import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MarketingAdminController } from './admin/marketing.admin.controller';
import { MenuAdminController } from './admin/menu.admin.controller';
import { OpsAdminController } from './admin/ops.admin.controller';
import { ReportsService } from './admin/reports.service';
import { OrderIntentService } from './ai/order-intent.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { CartController, RecommendationController } from './cart/cart.controller';
import { CartService } from './cart/cart.service';
import { RecommendationService } from './cart/recommendation.service';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { AuthGuard } from './common/auth';
import { env } from './common/env';
import { ErrorFilter } from './common/errors';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { PrismaService } from './common/prisma.service';
import { RateLimitGuard } from './common/rate-limit.guard';
import { RedisService } from './common/redis.service';
import { LineService } from './line/line.service';
import { AccountController } from './loyalty/account.controller';
import { LoyaltyService } from './loyalty/loyalty.service';
import { EtaService } from './orders/eta.service';
import { NOTIFY_QUEUE, ORDERS_QUEUE, OrderLifecycleService } from './orders/lifecycle.service';
import { OrdersController, PaymentsController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { StockService } from './orders/stock.service';
import { PaymentsService } from './payments/payments.service';
import { DevController, WebhooksController } from './payments/webhooks.controller';
import { NotificationsProcessor, OrdersProcessor } from './queue/processors';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { AiController, UploadsController } from './uploads/uploads.controller';

const redisUrl = new URL(env.redisUrl);

@Global()
@Module({
  imports: [
    JwtModule.register({ secret: env.jwtSecret }),
    BullModule.forRoot({
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
        password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
        // rediss:// (Upstash and most managed Redis) needs TLS
        tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
      },
    }),
    BullModule.registerQueue({ name: ORDERS_QUEUE }, { name: NOTIFY_QUEUE }),
  ],
  controllers: [
    AuthController,
    CatalogController,
    CartController,
    RecommendationController,
    OrdersController,
    PaymentsController,
    WebhooksController,
    DevController,
    AccountController,
    MenuAdminController,
    OpsAdminController,
    MarketingAdminController,
    UploadsController,
    AiController,
  ],
  providers: [
    PrismaService,
    RedisService,
    RealtimeGateway,
    LineService,
    AuthService,
    CatalogService,
    CartService,
    RecommendationService,
    EtaService,
    StockService,
    LoyaltyService,
    PaymentsService,
    OrderLifecycleService,
    OrdersService,
    ReportsService,
    OrderIntentService,
    OrdersProcessor,
    NotificationsProcessor,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}
