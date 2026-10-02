import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import PQueue from 'p-queue';
import { JOB_REPOSITORY, type JobRepository } from '../database/job.repository';
import { MetricsService } from '../metrics/metrics.service';
import { PipelineService } from '../pipeline/pipeline.service';

@Injectable()
export class JobWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobWorker.name);
  private readonly queue = new PQueue({ concurrency: 1 });
  private readonly pending = new Set<string>();

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobs: JobRepository,
    private readonly pipeline: PipelineService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const unfinished = await this.jobs.listUnfinished();
    this.logger.log({ count: unfinished.length }, 'resuming unfinished jobs');
    for (const job of unfinished) this.enqueue(job.id);
  }

  enqueue(jobId: string): void {
    if (this.pending.has(jobId)) return;
    this.pending.add(jobId);
    this.metrics.queueDepth = this.queue.size + this.queue.pending + 1;
    void this.queue.add(async () => {
      try {
        await this.pipeline.run(jobId);
      } catch (error) {
        const name = error instanceof Error ? error.name : 'Error';
        this.logger.error({ jobId, name }, 'worker caught a failure');
      } finally {
        this.pending.delete(jobId);
        this.metrics.queueDepth = this.queue.size + this.queue.pending;
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.queue.pause();
    this.queue.clear();
    await this.queue.onIdle();
  }
}
