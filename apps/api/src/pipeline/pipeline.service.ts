import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  detectLanguage,
  detectMime,
  findDangerousPdfFeatures,
  fontForLanguage,
  groupTokensIntoBlocks,
  shrinkToFit,
  type Job,
  type JobPage,
  type TextBlock,
  type TranslationContext,
} from '@doctranslate/shared';
import { AppException } from '../common/app.exception';
import { AppConfig } from '../config/env';
import { JOB_REPOSITORY, type JobRepository } from '../database/job.repository';
import { MetricsService } from '../metrics/metrics.service';
import { DocumentService, type PreparedPage } from './document.service';
import { OcrEngine, TranslationEngine } from '../providers/engines';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.service';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobs: JobRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly metrics: MetricsService,
    private readonly config: AppConfig,
    private readonly ocr: OcrEngine,
    private readonly translator: TranslationEngine,
    private readonly documents: DocumentService,
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
      const pageCount = await this.documents.countPages(file, mime);
      if (pageCount > this.config.maxPages) {
        throw new AppException(
          'TOO_MANY_PAGES',
          `This document has ${pageCount} pages. The limit is ${this.config.maxPages}.`,
          400,
        );
      }
      const used = await this.jobs.pagesUsedThisMonth(job.userId);
      const already = job.pageCount;
      if (this.config.monthlyPageQuota > 0 && used - already + pageCount > this.config.monthlyPageQuota) {
        throw new AppException(
          'QUOTA_EXCEEDED',
          `Monthly page quota exceeded (limit ${this.config.monthlyPageQuota}).`,
          429,
        );
      }
      await this.jobs.updateJob(job.id, { originalHash, pageCount });
      let detected: string | null = job.detectedLang;
      let glossary: TranslationContext['glossary'] = [];
      let processed = 0;
      for await (const preparedPage of this.documents.eachPage(file, mime)) {
        const fresh = await this.jobs.getJob(job.id);
        let page = fresh?.pages.find((item) => item.pageIndex === preparedPage.index) ?? null;
        if (!page) {
          page = {
            id: randomUUID(),
            jobId: job.id,
            pageIndex: preparedPage.index,
            status: 'queued',
            width: preparedPage.width,
            height: preparedPage.height,
            imagePath: null,
            blocks: [],
            error: null,
          };
          await this.jobs.insertPage(page);
        }
        if (page.status === 'done') continue;
        if (preparedPage.image) {
          const imagePath = `${job.userId}/${job.id}/page-${preparedPage.index}.png`;
          await this.storage.save(imagePath, preparedPage.image, 'image/png');
          page = { ...page, imagePath };
        }
        const outcome = await this.processPage(job, page, preparedPage, glossary, detected);
        glossary = outcome.glossary;
        detected = outcome.detected ?? detected;
        preparedPage.image = null;
        processed += 1;
      }
      const prepared = { length: processed || pageCount };
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

  private async processPage(
    job: Job,
    page: JobPage,
    prepared: PreparedPage,
    glossary: TranslationContext['glossary'],
    detected: string | null,
  ): Promise<{ glossary: TranslationContext['glossary']; detected: string | null }> {
    let current: JobPage = {
      ...page,
      width: prepared.width,
      height: prepared.height,
      blocks: page.blocks,
    };
    const hints = job.sourceLang === 'auto' ? ['en', 'ar', 'fr', 'de'] : [job.sourceLang];
    if (current.status === 'queued' || current.status === 'failed' || current.status === 'ocr') {
      current = await this.persist(current, 'ocr');
      const recognized = prepared.tokens
        ? { tokens: prepared.tokens, language: null as string | null }
        : prepared.image
          ? await this.ocr.recognize(prepared.image, hints)
          : null;
      if (!recognized || recognized.tokens.length === 0) {
        throw new AppException('PROVIDER_FAILURE', 'No text was found on this page.', 502);
      }
      const blocks = groupTokensIntoBlocks(recognized.tokens, {
        pageIndex: current.pageIndex,
        sourceLang: job.sourceLang,
      });
      if (!detected && recognized.language) detected = recognized.language;
      current = { ...current, blocks, status: 'translating', error: null };
      await this.jobs.replacePage(current);
    }
    if (current.status === 'translating') {
      current = await this.persist(current, 'translating');
      const sourceLang = job.sourceLang === 'auto' ? (detected ?? 'auto') : job.sourceLang;
      const translated = await this.translator.translate(
        current.blocks.map((block) => ({ id: block.id, text: block.text })),
        { glossary, pageIndex: current.pageIndex, sourceLang, targetLang: job.targetLang },
      );
      const byId = new Map(translated.blocks.map((block) => [block.id, block.text]));
      glossary = translated.glossary;
      current = {
        ...current,
        blocks: current.blocks.map((block) => ({
          ...block,
          translatedText: byId.get(block.id) ?? block.translatedText,
        })),
        status: 'rendering',
      };
      await this.jobs.replacePage(current);
    }
    if (current.status === 'rendering') {
      current = await this.persist(current, 'rendering');
      const fitted = fitBlocks(current.blocks, job.targetLang, prepared.height);
      current = { ...current, blocks: fitted, status: 'done', error: null };
      await this.jobs.replacePage(current);
      this.metrics.pagesProcessed += 1;
    }
    const text = current.blocks.map((block) => block.text).join('\n');
    return { glossary, detected: detected ?? (await detectLanguage(text)) };
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
