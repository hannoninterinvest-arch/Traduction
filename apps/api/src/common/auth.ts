import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const IS_PUBLIC = 'doctranslate:public';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) {
      throw unauthorizedMissing();
    }
    return request.user;
  },
);

function unauthorizedMissing(): Error {
  return new Error('Missing authenticated user');
}
