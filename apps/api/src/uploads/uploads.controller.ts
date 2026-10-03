import { Body, Controller, Headers, Inject, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createUploadSchema, detectMime } from '@doctranslate/shared';
import type { Request } from 'express';
import { AppException } from '../common/app.exception';
import { CurrentUser, type AuthUser } from '../common/auth';
import { AppConfig } from '../config/env';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.service';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly config: AppConfig,
  ) {}

  @Post('sign')
  sign(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = createUploadSchema.parse(body);
    return this.storage.createUpload(user.id, input.filename, input.contentType, input.size);
  }

  @Post('direct')
  async direct(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Headers('x-upload-path') path: string | undefined,
    @Headers('x-upload-token') token: string | undefined,
  ) {
    if (this.config.dataDriver === 'supabase') {
      throw new AppException(
        'VALIDATION',
        'Direct upload is only used with the memory or Neon driver.',
        400,
      );
    }
    if (!path || !token || !path.startsWith(`${user.id}/`) || path.includes('..')) {
      throw new AppException('FORBIDDEN', 'That upload does not belong to this account.', 403);
    }
    if (!this.storage.verifyUploadToken(path, token)) {
      throw new AppException('VALIDATION', 'The upload link expired. Start again.', 400);
    }
    const body = request.body;
    const file = Buffer.isBuffer(body) ? body : Buffer.from([]);
    if (file.byteLength === 0 || file.byteLength > this.config.maxUploadBytes) {
      throw new AppException('FILE_TOO_LARGE', 'The upload was empty or too large.', 413);
    }
    const mime = detectMime(file);
    if (!mime)
      throw new AppException('UNSUPPORTED_FILE', 'Upload a PDF, JPG, PNG, or WEBP file.', 415);
    await this.storage.save(path, file, mime);
    return { path, size: file.byteLength, contentType: mime };
  }
}
