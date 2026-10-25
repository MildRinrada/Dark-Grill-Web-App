import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env } from './common/env';
import { serveFromBucket, UPLOAD_DIR, usesBucket } from './uploads/storage';

async function bootstrap() {
  // rawBody keeps the exact bytes for webhook signature checks
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({ origin: env.webOrigin, credentials: true });
  if (usesBucket) app.use('/uploads', serveFromBucket);
  else app.useStaticAssets(UPLOAD_DIR, { prefix: '/uploads', maxAge: '30d' });
  app.enableShutdownHooks();
  app.set('trust proxy', 'loopback');
  await app.listen(env.port);
  Logger.log(`API listening on http://localhost:${env.port}/api/v1`, 'Bootstrap');
}

void bootstrap();
