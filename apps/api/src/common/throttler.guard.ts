import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthedRequest } from './auth';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: AuthedRequest): Promise<string> {
    return req.user?.id ?? req.ip ?? 'unknown';
  }
}
