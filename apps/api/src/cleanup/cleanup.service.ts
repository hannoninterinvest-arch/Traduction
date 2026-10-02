import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfig } from '../config/env';
import { JOB_REPOSITORY, type JobRepository } from '../database/job.repository';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobs: JobRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly config: AppConfig,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async removeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.retentionHours * 60 * 60 * 1000).toISOString();
    const expired = await this.jobs.listExpired(cutoff);
    for (const job of expired) {
      await this.storage.remove(job.originalPath);
      for (const page of job.pages) {
        if (page.imagePath) await this.storage.remove(page.imagePath);
      }
      await this.jobs.deleteJob(job.id);
      await this.jobs.appendAudit({
        jobId: job.id,
        userId: job.userId,
        action: 'job.expired',
        timestamp: new Date().toISOString(),
        metadata: { pages: job.pageCount },
      });
    }
    if (expired.length > 0) this.logger.log({ removed: expired.length }, 'retention cleanup');
    return expired.length;
  }
}
