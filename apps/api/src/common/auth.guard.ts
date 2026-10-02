import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JWTPayload } from 'jose';
import { AppConfig } from '../config/env';
import { AppException, unauthorized } from './app.exception';
import { IS_PUBLIC, type AuthedRequest } from './auth';

@Injectable()
export class AuthGuard implements CanActivate {
  private jwks: ReturnType<typeof import('jose').createRemoteJWKSet> | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) throw unauthorized();
    request.user = await this.verify(token);
    return true;
  }

  private async verify(token: string): Promise<{ id: string; email: string | null }> {
    if (this.config.authMode === 'dev') {
      if (!token.startsWith('dev:')) throw unauthorized();
      const id = token.slice(4);
      if (!/^[\w-]{1,80}$/.test(id)) throw unauthorized();
      return { id, email: 'local@doctranslate.dev' };
    }
    if (!this.config.supabaseUrl) {
      throw new AppException('INTERNAL', 'Authentication is not configured.', 500);
    }
    try {
      const { jwtVerify, createRemoteJWKSet } = await import('jose');
      const payload = this.config.supabaseJwtSecret
        ? (await jwtVerify(token, new TextEncoder().encode(this.config.supabaseJwtSecret))).payload
        : await this.verifyWithJwks(token, jwtVerify, createRemoteJWKSet);
      const sub = payload.sub;
      if (!sub) throw unauthorized();
      const email = typeof payload.email === 'string' ? payload.email : null;
      return { id: sub, email };
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw unauthorized();
    }
  }

  private async verifyWithJwks(
    token: string,
    jwtVerify: typeof import('jose').jwtVerify,
    createRemoteJWKSet: typeof import('jose').createRemoteJWKSet,
  ): Promise<JWTPayload> {
    const url = this.config.supabaseUrl.replace(/\/$/, '');
    this.jwks ??= createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: `${url}/auth/v1`,
      audience: 'authenticated',
    });
    return payload;
  }
}
