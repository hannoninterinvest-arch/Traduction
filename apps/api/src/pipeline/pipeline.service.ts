import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  detectLanguage,
  detectMime,
  findDangerousPdfFeatures,
  fontForLanguage,
  groupTokensIntoBlocks,
  sampleTokens,
  shrinkToFit,
  type Job,
  type JobPage,
  type OcrToken,
  type SupportedMime,
  type TextBlock,
} from '@doctranslate/shared';
import { AppException } from '../common/app.exception';
import { AppConfig } from '../config/env';
import { JOB_REPOSITORY, type JobRepository } from '../database/job.repository';
import { MetricsService } from '../metrics/metrics.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.service';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobs: JobRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly metrics: MetricsService,
    private readonly config: AppConfig,
  ) {}

  async run(jobId: string): Promise<void> {
    const job = await this.jobs.getJob(jobId);
    if (!job || job.status === 'done' || job.status === 'cancelled') return;
    await this.jobs.updateJob(job.id, { status: 'processing', error: null });
    try {
      const file = await this.storage.read(job.originalPath);
      const mime = detectMime(file);
      if (!mime) {
        throw new AppException('UNSUPPORTED_FILE', 'Upload a PDF, JPG, PNG, or WEBP file.', 415);
      }
      const stripped = findDangerousPdfFeatures(file);
      if (stripped.length > 0) {
        await this.jobs.appendAudit({
          jobId: job.id,
          userId: job.userId,
          action: 'pdf.sanitized',
          timestamp: new Date().toISOString(),
          metadata: { features: stripped.length },
        });
      }
      const originalHash = createHash('sha256').update(file).digest('hex');
      const prepared = this.preparePages(file, mime, job.sourceLang);
      if (prepared.length > this.config.maxPages) {
        throw new AppException(
          'TOO_MANY_PAGES',
          `This document has ${prepared.length} pages. The limit is ${this.config.maxPages}.`,
          400,
        );
      }
      const used = await this.jobs.pagesUsedThisMonth(job.userId);
      const already = job.pageCount;
      if (
        this.config.monthlyPageQuota > 0 &&
        used - already + prepared.length > this.config.monthlyPageQuota
      ) {
        throw new AppException(
          'QUOTA_EXCEEDED',
          `Monthly page quota exceeded (limit ${this.config.monthlyPageQuota}).`,
          429,
        );
      }
      await this.jobs.updateJob(job.id, { originalHash, pageCount: prepared.length });
      let detected: string | null = job.detectedLang;
      for (const preparedPage of prepared) {
        const fresh = await this.jobs.getJob(job.id);
        const page = fresh?.pages.find((item) => item.pageIndex === preparedPage.index);
        if (!page || page.status === 'done') continue;
        const sourceText = await this.processPage(
          job,
          page,
          preparedPage.tokens,
          preparedPage.width,
          preparedPage.height,
        );
        if (!detected) detected = await detectLanguage(sourceText);
      }
      const finished = await this.jobs.getJob(job.id);
      const outputHash = createHash('sha256')
        .update(JSON.stringify(finished?.pages.map((page) => page.blocks) ?? []))
        .digest('hex');
      const failed = finished?.pages.some((page) => page.status === 'failed') ?? false;
      await this.jobs.updateJob(job.id, {
        status: failed ? 'failed' : 'done',
        detectedLang: detected,
        outputHash,
        error: failed ? 'One or more pages could not be translated.' : null,
      });
      if (!failed) {
        this.metrics.jobsCompleted += 1;
        await this.jobs.appendAudit({
          jobId: job.id,
          userId: job.userId,
          action: 'job.completed',
          timestamp: new Date().toISOString(),
          metadata: { originalHash, outputHash, pages: prepared.length },
        });
      } else {
        this.metrics.jobsFailed += 1;
      }
      this.logger.log({ jobId: job.id, pages: prepared.length, failed }, 'job finished');
    } catch (error) {
      const message =
        error instanceof AppException ? error.message : 'The document could not be processed.';
      this.logger.error(
        { jobId, code: error instanceof AppException ? 'app' : 'internal' },
        'job failed',
      );
      await this.jobs.updateJob(jobId, { status: 'failed', error: message });
      this.metrics.jobsFailed += 1;
      await this.jobs.appendAudit({
        jobId,
        userId: job.userId,
        action: 'job.failed',
        timestamp: new Date().toISOString(),
        metadata: { reason: error instanceof AppException ? error.message : 'internal' },
      });
    }
  }

  private preparePages(
    file: Buffer,
    mime: SupportedMime,
    sourceLang: string,
  ): Array<{ index: number; width: number; height: number; tokens: OcrToken[] }> {
    const kind =
      sourceLang === 'ar' || sourceLang === 'de' || sourceLang === 'en' ? sourceLang : 'en';
    if (mime === 'application/pdf') {
      const text = file.toString('latin1');
      const pageMarkers = text.match(/\/Type\s*\/Page(?!s)/g);
      const count = Math.max(1, pageMarkers?.length ?? 1);
      return Array.from({ length: count }, (_item, index) => ({
        index,
        width: 700,
        height: 900,
        tokens: sampleTokens(kind),
      }));
    }
    return [{ index: 0, width: 700, height: 900, tokens: sampleTokens(kind) }];
  }

  private async processPage(
    job: Job,
    page: JobPage,
    tokens: OcrToken[],
    width: number,
    height: number,
  ): Promise<string> {
    let current: JobPage = { ...page, width, height, blocks: page.blocks };
    if (current.status === 'queued' || current.status === 'failed' || current.status === 'ocr') {
      current = await this.persist(current, 'ocr');
      const blocks = groupTokensIntoBlocks(tokens, {
        pageIndex: current.pageIndex,
        sourceLang: job.sourceLang,
      });
      current = { ...current, blocks, status: 'translating', error: null };
      await this.jobs.replacePage(current);
    }
    if (current.status === 'translating') {
      current = await this.persist(current, 'translating');
      current = {
        ...current,
        blocks: current.blocks.map((block) => ({
          ...block,
          translatedText: `[${job.targetLang}] ${block.text}`,
        })),
        status: 'rendering',
      };
      await this.jobs.replacePage(current);
    }
    if (current.status === 'rendering') {
      current = await this.persist(current, 'rendering');
      const fitted = fitBlocks(current.blocks, job.targetLang, height);
      current = { ...current, blocks: fitted, status: 'done', error: null };
      await this.jobs.replacePage(current);
      this.metrics.pagesProcessed += 1;
    }
    return current.blocks.map((block) => block.text).join('\n');
  }

  private async persist(page: JobPage, status: JobPage['status']): Promise<JobPage> {
    const next = { ...page, status };
    this.metrics.stage(page.jobId, page.pageIndex, status);
    await this.jobs.replacePage(next);
    return next;
  }
}

export function fitBlocks(
  blocks: TextBlock[],
  targetLang: string,
  pageHeight: number,
): TextBlock[] {
  const font = fontForLanguage(targetLang);
  return blocks.map((block) => {
    const neighbors = blocks.filter((other) => other.id !== block.id).map((other) => other.bbox);
    const fitted = shrinkToFit({
      text: block.translatedText || block.text,
      bbox: block.bbox,
      neighbors,
      pageHeight,
    });
    return {
      ...block,
      fontFamily: font.family,
      direction: font.direction,
      rtl: font.direction === 'rtl',
      align: font.direction === 'rtl' ? 'right' : 'left',
      fontSize: fitted.fontSize,
      renderBBox: fitted.renderBBox,
    };
  });
}
