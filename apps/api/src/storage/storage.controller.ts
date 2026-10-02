import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/auth';
import { notFound } from '../common/app.exception';
import { OBJECT_STORAGE, type MemoryStorage, type ObjectStorage } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  @Public()
  @Get('object')
  async download(
    @Query('path') path: string,
    @Query('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!path || !token || !this.storage.verifyUploadToken(path, token)) {
      throw notFound('That download link is invalid or expired.');
    }
    const local = this.storage as MemoryStorage;
    if (!local.readLocal) throw notFound();
    const object = local.readLocal(path);
    if (!object) throw notFound();
    res.setHeader('Content-Type', object.contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(object.body);
  }
}
