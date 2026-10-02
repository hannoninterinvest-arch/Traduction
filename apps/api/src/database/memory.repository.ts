import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  appendAuditEntry,
  type AuditEntry,
  type AuditEntryInput,
  type Job,
  type JobPage,
  type JobSummary,
  type UserPreferences,
} from '@doctranslate/shared';
import type { JobRepository } from './job.repository';

const sha256 = (payload: string) => createHash('sha256').update(payload).digest('hex');

@Injectable()
export class MemoryJobRepository implements JobRepository {
  private readonly jobs = new Map<string, Job>();
  private readonly audit: AuditEntry[] = [];
  private readonly prefs = new Map<string, UserPreferences>();
  private chain: Promise<void> = Promise.resolve();

  async createJob(job: Job): Promise<void> {
    this.jobs.set(job.id, structuredClone(job));
  }

  async updateJob(id: string, patch: Partial<Omit<Job, 'id' | 'userId' | 'pages'>>): Promise<void> {
    const current = this.jobs.get(id);
    if (!current) return;
    this.jobs.set(id, {
      ...current,
      ...patch,
      pages: current.pages,
      updatedAt: new Date().toISOString(),
    });
  }

  async getJob(id: string): Promise<Job | null> {
    const job = this.jobs.get(id);
    return job ? structuredClone(job) : null;
  }

  async listJobs(userId: string): Promise<JobSummary[]> {
    return [...this.jobs.values()]
      .filter((job) => job.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(summarize);
  }

  async listUnfinished(): Promise<Job[]> {
    return [...this.jobs.values()]
      .filter((job) => job.status === 'queued' || job.status === 'processing')
      .map((job) => structuredClone(job));
  }

  async listExpired(cutoffIso: string): Promise<Job[]> {
    return [...this.jobs.values()]
      .filter((job) => job.createdAt < cutoffIso)
      .map((job) => structuredClone(job));
  }

  async deleteJob(id: string): Promise<void> {
    this.jobs.delete(id);
  }

  async insertPage(page: JobPage): Promise<void> {
    const job = this.jobs.get(page.jobId);
    if (!job || job.pages.some((current) => current.pageIndex === page.pageIndex)) return;
    job.pages.push(structuredClone(page));
    job.pages.sort((a, b) => a.pageIndex - b.pageIndex);
  }

  async replacePage(page: JobPage): Promise<void> {
    const job = this.jobs.get(page.jobId);
    if (!job) return;
    const pages = job.pages.map((current) =>
      current.id === page.id ? structuredClone(page) : current,
    );
    this.jobs.set(job.id, { ...job, pages, updatedAt: new Date().toISOString() });
  }

  async pagesUsedThisMonth(userId: string): Promise<number> {
    const start = monthStartIso();
    return [...this.jobs.values()]
      .filter(
        (job) => job.userId === userId && job.status !== 'cancelled' && job.createdAt >= start,
      )
      .reduce((sum, job) => sum + job.pageCount, 0);
  }

  async appendAudit(input: AuditEntryInput): Promise<AuditEntry> {
    const run = this.chain.then(() => {
      const previous = this.audit[this.audit.length - 1] ?? null;
      const created = appendAuditEntry(previous, input, sha256);
      this.audit.push(created);
      return created;
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async listAuditForUser(userId: string): Promise<AuditEntry[]> {
    return this.audit.filter((entry) => entry.userId === userId).map((entry) => ({ ...entry }));
  }

  async getPreferences(userId: string): Promise<UserPreferences> {
    return (
      this.prefs.get(userId) ?? {
        userId,
        defaultTargetLang: 'en',
        updatedAt: new Date().toISOString(),
      }
    );
  }

  async savePreferences(prefs: UserPreferences): Promise<void> {
    this.prefs.set(prefs.userId, { ...prefs });
  }

  async deleteUserData(userId: string): Promise<string[]> {
    const paths: string[] = [];
    for (const job of this.jobs.values()) {
      if (job.userId !== userId) continue;
      paths.push(job.originalPath);
      for (const page of job.pages) {
        if (page.imagePath) paths.push(page.imagePath);
      }
      this.jobs.delete(job.id);
    }
    this.prefs.delete(userId);
    return paths;
  }
}

function summarize(job: Job): JobSummary {
  return {
    id: job.id,
    status: job.status,
    sourceLang: job.sourceLang,
    detectedLang: job.detectedLang,
    targetLang: job.targetLang,
    originalFilename: job.originalFilename,
    pageCount: job.pageCount,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
  };
}

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
