import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  appendAuditEntry,
  type AuditEntry,
  type AuditEntryInput,
  type Job,
  type JobPage,
  type JobStatus,
  type JobSummary,
  type PageStatus,
  type TextBlock,
  type UserPreferences,
} from '@doctranslate/shared';
import type { HashMatch, JobRepository } from './job.repository';

const sha256 = (payload: string) => createHash('sha256').update(payload).digest('hex');

interface JobRow {
  id: string;
  user_id: string;
  status: JobStatus;
  source_lang: string;
  detected_lang: string | null;
  target_lang: string;
  original_filename: string;
  original_path: string;
  original_hash: string | null;
  output_hash: string | null;
  page_count: number;
  error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PageRow {
  id: string;
  job_id: string;
  page_index: number;
  status: PageStatus;
  width: number;
  height: number;
  image_path: string | null;
  blocks: TextBlock[] | null;
  error: string | null;
}

@Injectable()
export class PostgresJobRepository implements JobRepository {
  private readonly logger = new Logger(PostgresJobRepository.name);
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly pool: Pool) {}

  async createJob(job: Job): Promise<void> {
    await this.pool.query(
      `insert into jobs (
        id, user_id, status, source_lang, detected_lang, target_lang, original_filename,
        original_path, original_hash, output_hash, page_count, error, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        job.id,
        job.userId,
        job.status,
        job.sourceLang,
        job.detectedLang,
        job.targetLang,
        job.originalFilename,
        job.originalPath,
        job.originalHash,
        job.outputHash,
        job.pageCount,
        job.error,
        job.createdAt,
        job.updatedAt,
      ],
    );
    for (const page of job.pages) await this.insertPage(page);
  }

  async updateJob(id: string, patch: Partial<Omit<Job, 'id' | 'userId' | 'pages'>>): Promise<void> {
    const sets: string[] = ['updated_at = now()'];
    const values: Array<string | number | null> = [];
    const add = (column: string, value: string | number | null | undefined) => {
      if (value === undefined) return;
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    add('status', patch.status);
    add('source_lang', patch.sourceLang);
    add('detected_lang', patch.detectedLang);
    add('target_lang', patch.targetLang);
    add('original_filename', patch.originalFilename);
    add('original_path', patch.originalPath);
    add('original_hash', patch.originalHash);
    add('output_hash', patch.outputHash);
    add('page_count', patch.pageCount);
    add('error', patch.error);
    values.push(id);
    await this.pool.query(
      `update jobs set ${sets.join(', ')} where id = $${values.length}`,
      values,
    );
  }

  async getJob(id: string): Promise<Job | null> {
    const result = await this.pool.query<JobRow>('select * from jobs where id = $1', [id]);
    const row = result.rows[0];
    if (!row) return null;
    return this.fromJob(row, await this.pagesFor(id));
  }

  async listJobs(userId: string): Promise<JobSummary[]> {
    const result = await this.pool.query<JobRow>(
      'select * from jobs where user_id = $1 order by created_at desc',
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      sourceLang: row.source_lang,
      detectedLang: row.detected_lang,
      targetLang: row.target_lang,
      originalFilename: row.original_filename,
      pageCount: row.page_count,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      error: row.error,
    }));
  }

  async listUnfinished(): Promise<Job[]> {
    const result = await this.pool.query<JobRow>(
      `select * from jobs where status in ('queued', 'processing')`,
    );
    return this.hydrate(result.rows);
  }

  async listExpired(cutoffIso: string): Promise<Job[]> {
    const result = await this.pool.query<JobRow>('select * from jobs where created_at < $1', [
      cutoffIso,
    ]);
    return this.hydrate(result.rows);
  }

  async deleteJob(id: string): Promise<void> {
    await this.pool.query('delete from jobs where id = $1', [id]);
  }

  async insertPage(page: JobPage): Promise<void> {
    await this.pool.query(
      `insert into job_pages (
        id, job_id, page_index, status, width, height, image_path, blocks, error
      ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
      on conflict (job_id, page_index) do nothing`,
      [
        page.id,
        page.jobId,
        page.pageIndex,
        page.status,
        page.width,
        page.height,
        page.imagePath,
        JSON.stringify(page.blocks),
        page.error,
      ],
    );
  }

  async replacePage(page: JobPage): Promise<void> {
    await this.pool.query(
      `update job_pages set
        status = $2, width = $3, height = $4, image_path = $5, blocks = $6::jsonb, error = $7, updated_at = now()
      where id = $1`,
      [
        page.id,
        page.status,
        page.width,
        page.height,
        page.imagePath,
        JSON.stringify(page.blocks),
        page.error,
      ],
    );
  }

  async pagesUsedThisMonth(userId: string): Promise<number> {
    const result = await this.pool.query<{ used: string }>(
      `select coalesce(sum(page_count), 0)::int as used
       from jobs
       where user_id = $1
         and status <> 'cancelled'
         and created_at >= date_trunc('month', timezone('utc', now()))`,
      [userId],
    );
    return Number(result.rows[0]?.used ?? 0);
  }

  async appendAudit(input: AuditEntryInput): Promise<AuditEntry> {
    const run = this.chain.then(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(84215045)');
        const previous = await client.query<{ hash: string }>(
          'select hash from audit_log order by id desc limit 1',
        );
        const entry = appendAuditEntry(previous.rows[0] ?? null, input, sha256);
        await client.query(
          `insert into audit_log (job_id, user_id, action, metadata, prev_hash, hash, created_at)
           values ($1,$2,$3,$4::jsonb,$5,$6,$7)`,
          [
            entry.jobId,
            entry.userId,
            entry.action,
            JSON.stringify(entry.metadata ?? {}),
            entry.prevHash,
            entry.hash,
            entry.timestamp,
          ],
        );
        await client.query('commit');
        return entry;
      } catch (error) {
        await client.query('rollback');
        this.logger.error('database append audit failed');
        throw error;
      } finally {
        client.release();
      }
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async listAuditForUser(userId: string): Promise<AuditEntry[]> {
    const result = await this.pool.query<{
      job_id: string | null;
      user_id: string;
      action: string;
      metadata: AuditEntry['metadata'] | null;
      prev_hash: string;
      hash: string;
      created_at: Date | string;
    }>('select * from audit_log where user_id = $1 order by id asc', [userId]);
    return result.rows.map((row) => ({
      jobId: row.job_id,
      userId: row.user_id,
      action: row.action,
      timestamp: iso(row.created_at),
      metadata: row.metadata ?? {},
      prevHash: row.prev_hash,
      hash: row.hash,
    }));
  }

  async findByContentHash(userId: string, hash: string): Promise<HashMatch[]> {
    const needle = hash.toLowerCase();
    const matches: HashMatch[] = [];
    const jobs = await this.pool.query<{
      id: string;
      original_hash: string | null;
      output_hash: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `select id, original_hash, output_hash, created_at, updated_at
       from jobs
       where user_id = $1
         and (lower(original_hash) = $2 or lower(output_hash) = $2)`,
      [userId, needle],
    );
    for (const row of jobs.rows) {
      if (row.original_hash?.toLowerCase() === needle) {
        matches.push({
          jobId: row.id,
          source: 'job',
          field: 'original',
          action: null,
          createdAt: iso(row.created_at),
        });
      }
      if (row.output_hash?.toLowerCase() === needle) {
        matches.push({
          jobId: row.id,
          source: 'job',
          field: 'output',
          action: null,
          createdAt: iso(row.updated_at),
        });
      }
    }
    const audit = await this.pool.query<{
      job_id: string | null;
      action: string;
      metadata: Record<string, unknown> | null;
      created_at: Date | string;
    }>('select job_id, action, metadata, created_at from audit_log where user_id = $1', [userId]);
    for (const row of audit.rows) {
      for (const [key, value] of Object.entries(row.metadata ?? {})) {
        if (typeof value === 'string' && value.toLowerCase() === needle) {
          matches.push({
            jobId: row.job_id,
            source: 'audit',
            field: key,
            action: row.action,
            createdAt: iso(row.created_at),
          });
        }
      }
    }
    return matches;
  }

  async getPreferences(userId: string): Promise<UserPreferences> {
    const result = await this.pool.query<{
      user_id: string;
      default_target_lang: string;
      updated_at: Date | string;
    }>('select * from user_preferences where user_id = $1', [userId]);
    const row = result.rows[0];
    if (!row) {
      return { userId, defaultTargetLang: 'en', updatedAt: new Date().toISOString() };
    }
    return {
      userId: row.user_id,
      defaultTargetLang: row.default_target_lang,
      updatedAt: iso(row.updated_at),
    };
  }

  async savePreferences(prefs: UserPreferences): Promise<void> {
    await this.pool.query(
      `insert into user_preferences (user_id, default_target_lang, updated_at)
       values ($1, $2, $3)
       on conflict (user_id) do update
       set default_target_lang = excluded.default_target_lang, updated_at = excluded.updated_at`,
      [prefs.userId, prefs.defaultTargetLang, prefs.updatedAt],
    );
  }

  async deleteUserData(userId: string): Promise<string[]> {
    const jobs = await this.pool.query<{ id: string }>('select id from jobs where user_id = $1', [
      userId,
    ]);
    const paths: string[] = [];
    for (const row of jobs.rows) {
      const job = await this.getJob(row.id);
      if (!job) continue;
      paths.push(job.originalPath);
      for (const page of job.pages) {
        if (page.imagePath) paths.push(page.imagePath);
      }
    }
    await this.pool.query('delete from jobs where user_id = $1', [userId]);
    await this.pool.query('delete from user_preferences where user_id = $1', [userId]);
    return paths;
  }

  private async hydrate(rows: JobRow[]): Promise<Job[]> {
    const jobs: Job[] = [];
    for (const row of rows) jobs.push(this.fromJob(row, await this.pagesFor(row.id)));
    return jobs;
  }

  private async pagesFor(jobId: string): Promise<PageRow[]> {
    const result = await this.pool.query<PageRow>(
      'select * from job_pages where job_id = $1 order by page_index asc',
      [jobId],
    );
    return result.rows;
  }

  private fromJob(row: JobRow, pages: PageRow[]): Job {
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      sourceLang: row.source_lang,
      detectedLang: row.detected_lang,
      targetLang: row.target_lang,
      originalFilename: row.original_filename,
      originalPath: row.original_path,
      originalHash: row.original_hash,
      outputHash: row.output_hash,
      pageCount: row.page_count,
      error: row.error,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      pages: pages.map((page) => ({
        id: page.id,
        jobId: page.job_id,
        pageIndex: page.page_index,
        status: page.status,
        width: page.width,
        height: page.height,
        imagePath: page.image_path,
        blocks: page.blocks ?? [],
        error: page.error,
      })),
    };
  }
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
