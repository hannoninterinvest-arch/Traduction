import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { extensionForMime, type SignedUpload, type SupportedMime } from '@doctranslate/shared';
import { AppException } from '../common/app.exception';
import { AppConfig } from '../config/env';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface ObjectStorage {
  createUpload(
    userId: string,
    filename: string,
    contentType: SupportedMime,
    size: number,
  ): Promise<SignedUpload>;
  save(path: string, body: Buffer, contentType: string): Promise<void>;
  read(path: string): Promise<Buffer>;
  remove(path: string): Promise<void>;
  signedDownload(path: string): Promise<string | null>;
  verifyUploadToken(path: string, token: string): boolean;
}

@Injectable()
export class MemoryStorage implements ObjectStorage {
  private readonly objects = new Map<string, StoredObject>();

  constructor(private readonly config: AppConfig) {}

  async createUpload(
    userId: string,
    _filename: string,
    contentType: SupportedMime,
    size: number,
  ): Promise<SignedUpload> {
    this.assertSize(size);
    const path = `${userId}/${randomUUID()}/original.${extensionForMime(contentType)}`;
    const token = this.sign(path, Date.now() + 15 * 60 * 1000);
    return {
      mode: 'direct',
      path,
      token,
      signedUrl: null,
      uploadUrl: `${this.config.apiPublicUrl}/uploads/direct`,
      bucket: 'documents',
    };
  }

  async save(path: string, body: Buffer, contentType: string): Promise<void> {
    this.assertSafePath(path);
    this.objects.set(path, { body, contentType });
  }

  async read(path: string): Promise<Buffer> {
    const found = this.objects.get(path);
    if (!found)
      throw new AppException('NOT_FOUND', 'The uploaded file is no longer available.', 404);
    return found.body;
  }

  async remove(path: string): Promise<void> {
    this.objects.delete(path);
  }

  async signedDownload(path: string): Promise<string | null> {
    if (!this.objects.has(path)) return null;
    const exp = Date.now() + 10 * 60 * 1000;
    const token = this.sign(path, exp);
    const params = new URLSearchParams({ path, token });
    return `${this.config.apiPublicUrl}/storage/object?${params.toString()}`;
  }

  verifyUploadToken(path: string, token: string): boolean {
    return this.verify(path, token);
  }

  readLocal(path: string): StoredObject | undefined {
    return this.objects.get(path);
  }

  private sign(path: string, exp: number): string {
    const sig = createHmac('sha256', this.config.tokenSecret)
      .update(`${path}|${exp}`)
      .digest('hex');
    return `${exp}.${sig}`;
  }

  private verify(path: string, token: string): boolean {
    const [expRaw, sig] = token.split('.');
    if (!expRaw || !sig) return false;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp < Date.now()) return false;
    const expected = createHmac('sha256', this.config.tokenSecret)
      .update(`${path}|${exp}`)
      .digest('hex');
    const left = Buffer.from(sig);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private assertSize(size: number): void {
    if (size > this.config.maxUploadBytes) {
      throw new AppException(
        'FILE_TOO_LARGE',
        `That file is over the ${Math.round(this.config.maxUploadBytes / (1024 * 1024))} MB limit.`,
        413,
      );
    }
  }

  private assertSafePath(path: string): void {
    if (path.includes('..') || path.startsWith('/')) {
      throw new AppException('VALIDATION', 'Invalid storage path.', 400);
    }
  }
}

@Injectable()
export class SupabaseStorage implements ObjectStorage {
  private readonly logger = new Logger(SupabaseStorage.name);
  private readonly client: SupabaseClient;
  private readonly bucket = 'documents';

  constructor(private readonly config: AppConfig) {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async createUpload(
    userId: string,
    _filename: string,
    contentType: SupportedMime,
    size: number,
  ): Promise<SignedUpload> {
    if (size > this.config.maxUploadBytes) {
      throw new AppException(
        'FILE_TOO_LARGE',
        `That file is over the ${Math.round(this.config.maxUploadBytes / (1024 * 1024))} MB limit.`,
        413,
      );
    }
    const path = `${userId}/${randomUUID()}/original.${extensionForMime(contentType)}`;
    const signed = await this.client.storage.from(this.bucket).createSignedUploadUrl(path);
    if (signed.error || !signed.data) {
      this.logger.error('signed upload url failed');
      throw new AppException('INTERNAL', 'Could not start the upload. Try again.', 500);
    }
    return {
      mode: 'supabase',
      path,
      token: signed.data.token,
      signedUrl: signed.data.signedUrl,
      uploadUrl: null,
      bucket: this.bucket,
    };
  }

  async save(path: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(path, body, {
      contentType,
      upsert: true,
    });
    if (error) {
      this.logger.error('storage upload failed');
      throw new AppException('INTERNAL', 'Could not store that file.', 500);
    }
  }

  async read(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error || !data) {
      throw new AppException('NOT_FOUND', 'The uploaded file is no longer available.', 404);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(path: string): Promise<void> {
    await this.client.storage.from(this.bucket).remove([path]);
  }

  async signedDownload(path: string): Promise<string | null> {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(path, 600);
    if (error || !data) return null;
    return data.signedUrl;
  }

  verifyUploadToken(): boolean {
    return false;
  }
}
