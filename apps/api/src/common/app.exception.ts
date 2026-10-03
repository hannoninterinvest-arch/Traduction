import { HttpException } from '@nestjs/common';
import type { AppErrorCode } from '@doctranslate/shared';

export class AppException extends HttpException {
  constructor(code: AppErrorCode, message: string, status: number) {
    super({ code, message }, status);
  }
}

export function notFound(message = 'That record was not found.'): AppException {
  return new AppException('NOT_FOUND', message, 404);
}

export function unauthorized(): AppException {
  return new AppException('UNAUTHORIZED', 'Sign in required.', 401);
}
