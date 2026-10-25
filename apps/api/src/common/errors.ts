import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError, ZodType } from 'zod';

/** Every error leaves the API as `{ error: { code, message, details } }`. */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: number = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super(message, status);
  }
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`, 404);
export const forbidden = (message = 'Forbidden') => new AppError('FORBIDDEN', message, 403);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(code, message, 409, details);

export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'Request body is invalid', 400, flatten(result.error));
  }
  return result.data;
}

function flatten(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (!res || typeof res.status !== 'function') return; // websocket context

    if (exception instanceof AppError) {
      res.status(exception.getStatus()).json({
        error: { code: exception.code, message: exception.message, details: exception.details ?? null },
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message);
      res.status(status).json({
        error: { code: HttpStatus[status] ?? 'HTTP_ERROR', message: String(message), details: null },
      });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : exception);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Unexpected error', details: null } });
  }
}
