import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  assertPageQuota,
  createJobSchema,
  detectMime,
  fontForLanguage,
  isKnownLanguage,
  QuotaExceededError,
  shrinkToFit,
  updateBlockSchema,
  type CreateJobInput,
  type Job,
  type JobPage,
  type JobSummary,
  type TextBlock,
  type UpdateBlockInput,
} from '@doctranslate/shared';
import { AppException, notFound } from '../common/app.exception';
import { AppConfig } from '../config/env';
import { JOB_REPOSITORY, type JobRepository } from '../database/job.repository';
import { MetricsService } from '../metrics/metrics.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.service';
import { JobWorker } from './job.worker';

export interface PageView extends JobPage {
  imageUrl: string | null;
}

export interface JobView extends Job {
  originalUrl: string | null;
  pages: PageView[];
}

@Injectable()
export class JobsService {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobs: JobRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly worker: JobWorker,
    private readonly metrics: MetricsService,
    private readonly config: AppConfig,
  ) {}

  async create(userId: string, raw: unknown): Promise<JobView> {
    const input = createJobSchema.parse(raw);
    if (!isKnownLanguage(input.targetLang) || !isKnownLanguage(input.sourceLang)) {
      throw new AppException('VALIDATION', 'Choose a supported language.', 400);
    }
    if (!input.path.startsWith(`${userId}/`) || input.path.includes('..')) {
      throw new AppException('FORBIDDEN', 'That upload does not belong to this account.', 403);
    }
    const file = await this.storage.read(input.path);
    if (file.byteLength > this.config.maxUploadBytes || input.size > this.config.maxUploadBytes) {
      throw new AppException(
        'FILE_TOO_LARGE',
        `That file is over the ${Math.round(this.config.maxUploadBytes / (1024 * 1024))} MB limit.`,
        413,
      );
    }
    const mime = detectMime(file);
    if (!mime || mime !== input.contentType) {
      throw new AppException('UNSUPPORTED_FILE', 'Upload a PDF, JPG, PNG, or WEBP file.', 415);
    }
    const pageCount = countPages(file, mime);
    if (pageCount > this.config.maxPages) {
      throw new AppException(
        'TOO_MANY_PAGES',
        `This document has ${pageCount} pages. The limit is ${this.config.maxPages}.`,
        400,
      );
    }
    try {
      assertPageQuota(
        await this.jobs.pagesUsedThisMonth(userId),
        pageCount,
        this.config.monthlyPageQuota,
      );
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        throw new AppException('QUOTA_EXCEEDED', error.message, 429);
      }
      throw error;
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    const pages: JobPage[] = Array.from({ length: pageCount }, (_item, index) => ({
      id: randomUUID(),
      jobId: id,
      pageIndex: index,
      status: 'queued',
      width: 0,
      height: 0,
      imagePath: null,
      blocks: [],
      error: null,
    }));
    const job: Job = {
      id,
      userId,
      status: 'queued',
      sourceLang: input.sourceLang,
      detectedLang: null,
      targetLang: input.targetLang,
      originalFilename: sanitizeFilename(input.filename),
      originalPath: input.path,
      originalHash: null,
      outputHash: null,
      pageCount,
      error: null,
      createdAt: now,
      updatedAt: now,
      pages,
    };
    await this.jobs.createJob(job);
    await this.jobs.appendAudit({
      jobId: id,
      userId,
      action: 'job.created',
      timestamp: now,
      metadata: { pages: pageCount, targetLang: input.targetLang },
    });
    this.metrics.jobsStarted += 1;
    this.worker.enqueue(id);
    return this.present(job);
  }

  async list(userId: string): Promise<JobSummary[]> {
    return this.jobs.listJobs(userId);
  }

  async get(userId: string, id: string): Promise<JobView> {
    return this.present(await this.requireOwned(userId, id));
  }

  async retry(userId: string, id: string): Promise<JobView> {
    const job = await this.requireOwned(userId, id);
    if (job.status !== 'failed') {
      throw new AppException('VALIDATION', 'Only a failed job can be retried.', 400);
    }
    await this.jobs.updateJob(id, { status: 'queued', error: null });
    for (const page of job.pages) {
      if (page.status === 'failed') {
        await this.jobs.replacePage({ ...page, status: 'queued', error: null });
      }
    }
    this.worker.enqueue(id);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const job = await this.requireOwned(userId, id);
    await this.storage.remove(job.originalPath);
    for (const page of job.pages) {
      if (page.imagePath) await this.storage.remove(page.imagePath);
    }
    await this.jobs.deleteJob(id);
    await this.jobs.appendAudit({
      jobId: id,
      userId,
      action: 'job.deleted',
      timestamp: new Date().toISOString(),
      metadata: { pages: job.pageCount },
    });
    return { ok: true };
  }

  async updateBlock(
    userId: string,
    jobId: string,
    pageId: string,
    blockId: string,
    raw: unknown,
  ): Promise<TextBlock> {
    const input: UpdateBlockInput = updateBlockSchema.parse(raw);
    const job = await this.requireOwned(userId, jobId);
    const page = job.pages.find((item) => item.id === pageId);
    if (!page) throw notFound('That page was not found.');
    const index = page.blocks.findIndex((block) => block.id === blockId);
    const current = page.blocks[index];
    if (!current || index < 0) throw notFound('That text block was not found.');
    const next: TextBlock = {
      ...current,
      translatedText: input.translatedText ?? current.translatedText,
      bbox: input.bbox ?? current.bbox,
      fontSize: input.fontSize ?? current.fontSize,
    };
    const neighbors = page.blocks
      .filter((block) => block.id !== blockId)
      .map((block) => block.bbox);
    const fitted = shrinkToFit({
      text: next.translatedText,
      bbox: next.bbox,
      neighbors,
      pageHeight: page.height || next.bbox.y + next.bbox.h + 40,
      maxFontSize: input.fontSize ?? next.fontSize,
    });
    next.fontSize = input.fontSize ?? fitted.fontSize;
    next.renderBBox = input.renderBBox ?? fitted.renderBBox;
    const font = fontForLanguage(job.targetLang);
    next.fontFamily = font.family;
    next.direction = font.direction;
    next.rtl = font.direction === 'rtl';
    const blocks = page.blocks.map((block) => (block.id === blockId ? next : block));
    await this.jobs.replacePage({ ...page, blocks });
    await this.jobs.appendAudit({
      jobId,
      userId,
      action: 'job.block_edited',
      timestamp: new Date().toISOString(),
      metadata: { pageIndex: page.pageIndex },
    });
    return next;
  }

  private async requireOwned(userId: string, id: string): Promise<Job> {
    const job = await this.jobs.getJob(id);
    if (!job) throw notFound('That job was not found.');
    if (job.userId !== userId)
      throw new AppException('FORBIDDEN', 'That job belongs to another account.', 403);
    return job;
  }

  private async present(job: Job): Promise<JobView> {
    const originalUrl = await this.storage.signedDownload(job.originalPath);
    const pages = await Promise.all(
      job.pages.map(async (page) => ({
        ...page,
        imageUrl: page.imagePath ? await this.storage.signedDownload(page.imagePath) : null,
      })),
    );
    return { ...job, originalUrl, pages };
  }
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'document';
  return base.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'document';
}

function countPages(file: Buffer, mime: CreateJobInput['contentType']): number {
  if (mime !== 'application/pdf') return 1;
  const text = file.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?!s)/g);
  return Math.max(1, matches?.length ?? 1);
}
