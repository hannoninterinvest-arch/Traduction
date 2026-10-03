import { Injectable } from '@nestjs/common';

export interface StageEvent {
  jobId: string;
  pageIndex: number;
  status: string;
  at: string;
}

@Injectable()
export class MetricsService {
  readonly startedAt = Date.now();
  jobsStarted = 0;
  jobsCompleted = 0;
  jobsFailed = 0;
  pagesProcessed = 0;
  queueDepth = 0;
  private stages: StageEvent[] = [];

  stage(jobId: string, pageIndex: number, status: string): void {
    this.stages.push({ jobId, pageIndex, status, at: new Date().toISOString() });
    if (this.stages.length > 100) this.stages.shift();
  }

  snapshot(): Record<string, number> {
    return {
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      jobsStarted: this.jobsStarted,
      jobsCompleted: this.jobsCompleted,
      jobsFailed: this.jobsFailed,
      pagesProcessed: this.pagesProcessed,
      queueDepth: this.queueDepth,
    };
  }

  recentStages(): StageEvent[] {
    return [...this.stages];
  }
}
