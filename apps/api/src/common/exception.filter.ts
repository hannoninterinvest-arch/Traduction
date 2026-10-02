import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { AppException } from './app.exception';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ZodError) {
      const issue = exception.issues[0];
      response.status(400).json({
        code: 'VALIDATION',
        message: issue?.message ?? 'Check the form and try again.',
      });
      return;
    }
    if (exception instanceof AppException || exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'code' in body) {
        response.status(status).json(body);
        return;
      }
      if (status === 429) {
        response.status(429).json({
          code: 'QUOTA_EXCEEDED',
          message: 'Too many requests. Wait a moment and try again.',
        });
        return;
      }
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? 'Request failed.');
      response.status(status).json({
        code: status === 401 ? 'UNAUTHORIZED' : 'VALIDATION',
        message: Array.isArray(message) ? message.join(' ') : message,
      });
      return;
    }
    const name = exception instanceof Error ? exception.name : 'Error';
    this.logger.error(`unhandled ${name}`);
    response.status(500).json({
      code: 'INTERNAL',
      message: 'Something went wrong. Please try again.',
    });
  }
}
