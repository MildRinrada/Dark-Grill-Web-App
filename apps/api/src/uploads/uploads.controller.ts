import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { z } from 'zod';
import { OrderIntentService } from '../ai/order-intent.service';
import { Authenticated } from '../common/auth';
import { AppError, parse } from '../common/errors';
import { saveUpload } from './storage';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/** Review photos and menu images, served back at /uploads/:key (see storage.ts). */
@Controller('uploads')
export class UploadsController {
  @Post()
  @Authenticated()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 3 * 1024 * 1024 },
      fileFilter: (_req, file, cb) =>
        ALLOWED.has(file.mimetype) ? cb(null, true) : cb(new AppError('UNSUPPORTED_FILE', 'Upload a JPG, PNG, WebP or AVIF image'), false),
      storage: memoryStorage(),
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new AppError('FILE_REQUIRED', 'Attach an image in the "file" field');
    const key = `${randomBytes(12).toString('hex')}${extname(file.originalname).toLowerCase() || '.jpg'}`;
    await saveUpload(key, file.buffer, file.mimetype);
    return { url: `/uploads/${key}`, size: file.size };
  }
}

@Controller('ai')
export class AiController {
  constructor(private readonly intent: OrderIntentService) {}

  @Post('order-intent')
  orderIntent(@Body() body: unknown) {
    const { text } = parse(z.object({ text: z.string().min(2).max(300) }), body);
    return this.intent.parse(text);
  }
}
