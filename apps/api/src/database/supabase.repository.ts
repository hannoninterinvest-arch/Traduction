import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
import { AppConfig } from '../config/env';
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
  created_at: string;
  updated_at: string;
}

interface PageRow {
  id: string;
  job_id: string;
  page_index: number;
  status: PageStatus;
  width: number;
  height: number;
  image_path: string | null;
  blocks: TextBlock[];
  error: string | null;
}

@Injectable()
export class SupabaseJobRepository implements JobRepository {
  private readonly logger = new Logger(SupabaseJobRepository.name);
  private readonly client: SupabaseClient;
  private chain: Promise<void> = Promise.resolve();

  constructor(config: AppConfig) {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async createJob(job: Job): Promise<void> {
    const { error } = await this.client.from('jobs').insert(this.toJobRow(job));
    this.assert(error, 'create job');
    if (job.pages.length === 0) return;
    const { error: pageError } = await this.client
      .from('job_pages')
      .insert(job.pages.map((page) => this.toPageRow(page)));
    this.assert(pageError, 'create pages');
  }

  async updateJob(id: string, patch: Partial<Omit<Job, 'id' | 'userId' | 'pages'>>): Promise<void> {
    const row: Record<string, string | number | null> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.sourceLang !== undefined) row.source_lang = patch.sourceLang;
    if (patch.detectedLang !== undefined) row.detected_lang = patch.detectedLang;
    if (patch.targetLang !== undefined) row.target_lang = patch.targetLang;
    if (patch.originalFilename !== undefined) row.original_filename = patch.originalFilename;
    if (patch.originalPath !== undefined) row.original_path = patch.originalPath;
    if (patch.originalHash !== undefined) row.original_hash = patch.originalHash;
    if (patch.outputHash !== undefined) row.output_hash = patch.outputHash;
    if (patch.pageCount !== undefined) row.page_count = patch.pageCount;
    if (patch.error !== undefined) row.error = patch.error;
    const { error } = await this.client.from('jobs').update(row).eq('id', id);
    this.assert(error, 'update job');
  }

  async getJob(id: string): Promise<Job | null> {
    const { data, error } = await this.client.from('jobs').select('*').eq('id', id).maybeSingle();
    this.assert(error, 'read job');
    if (!data) return null;
    const pages = await this.pagesFor(id);
    return this.fromJob(data as JobRow, pages);
  }

  async listJobs(userId: string): Promise<JobSummary[]> {
    const { data, error } = await this.client
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    this.assert(error, 'list jobs');
    return ((data ?? []) as JobRow[]).map((row) => ({
      id: row.id,
      status: row.status,
      sourceLang: row.source_lang,
      detectedLang: row.detected_lang,
      targetLang: row.target_lang,
      originalFilename: row.original_filename,
      pageCount: row.page_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      error: row.error,
    }));
  }

  async listUnfinished(): Promise<Job[]> {
    const { data, error } = await this.client
      .from('jobs')
      .select('*')
      .in('status', ['queued', 'processing']);
    this.assert(error, 'list unfinished');
    return this.hydrate((data ?? []) as JobRow[]);
  }

  async listExpired(cutoffIso: string): Promise<Job[]> {
    const { data, error } = await this.client.from('jobs').select('*').lt('created_at', cutoffIso);
    this.assert(error, 'list expired');
    return this.hydrate((data ?? []) as JobRow[]);
  }

  async deleteJob(id: string): Promise<void> {
    const { error } = await this.client.from('jobs').delete().eq('id', id);
    this.assert(error, 'delete job');
  }

  async insertPage(page: JobPage): Promise<void> {
    const { error } = await this.client.from('job_pages').insert(this.toPageRow(page));
    this.assert(error, 'insert page');
  }

  async replacePage(page: JobPage): Promise<void> {
    const { error } = await this.client
      .from('job_pages')
      .update(this.toPageRow(page))
      .eq('id', page.id);
    this.assert(error, 'update page');
  }

  async pagesUsedThisMonth(userId: string): Promise<number> {
    const { data, error } = await this.client.rpc('pages_used_this_month', { uid: userId });
    if (error) {
      this.logger.warn('pages_used_this_month rpc failed');
      return 0;
    }
    return typeof data === 'number' ? data : 0;
  }

  async appendAudit(input: AuditEntryInput): Promise<AuditEntry> {
    const run = this.chain.then(async () => {
      const { data, error } = await this.client
        .from('audit_log')
        .select('hash')
        .order('id', { ascending: false })
        .limit(1);
      this.assert(error, 'read audit');
      const rows = (data ?? []) as Array<{ hash: string }>;
      const previous = rows[0] ? { hash: rows[0].hash } : null;
      const entry = appendAuditEntry(previous, input, sha256);
      const { error: insertError } = await this.client.from('audit_log').insert({
        job_id: entry.jobId,
        user_id: entry.userId,
        action: entry.action,
        metadata: entry.metadata ?? {},
        prev_hash: entry.prevHash,
        hash: entry.hash,
        created_at: entry.timestamp,
      });
      this.assert(insertError, 'append audit');
      return entry;
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async findByContentHash(userId: string, hash: string): Promise<HashMatch[]> {
    const needle = hash.toLowerCase();
    const matches: HashMatch[] = [];
    const { data: jobs, error } = await this.client
      .from('jobs')
      .select('id, original_hash, output_hash, created_at, updated_at')
      .eq('user_id', userId)
      .or(`original_hash.eq.${needle},output_hash.eq.${needle}`);
    this.assert(error, 'find job hash');
    for (const row of (jobs ?? []) as Array<{
      id?: string | null;
      original_hash?: string | null;
      output_hash?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    }>) {
      if (row.original_hash?.toLowerCase() === needle) {
        matches.push({
          jobId: row.id ?? null,
          source: 'job',
          field: 'original',
          action: null,
          createdAt: row.created_at ?? '',
        });
      }
      if (row.output_hash?.toLowerCase() === needle) {
        matches.push({
          jobId: row.id ?? null,
          source: 'job',
          field: 'output',
          action: null,
          createdAt: row.updated_at ?? '',
        });
      }
    }
    const { data: audit, error: auditError } = await this.client
      .from('audit_log')
      .select('job_id, action, metadata, created_at')
      .eq('user_id', userId);
    this.assert(auditError, 'find audit hash');
    for (const row of (audit ?? []) as Array<Record<string, unknown>>) {
      const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
      for (const [key, value] of Object.entries(metadata)) {
        if (typeof value === 'string' && value.toLowerCase() === needle) {
          matches.push({
            jobId: (row.job_id as string | null) ?? null,
            source: 'audit',
            field: key,
            action: String(row.action),
            createdAt: String(row.created_at),
          });
        }
      }
    }
    return matches;
  }

  async listAuditForUser(userId: string): Promise<AuditEntry[]> {
    const { data, error } = await this.client
      .from('audit_log')
      .select('*')
      .eq('user_id', userId)
      .order('id', { ascending: true });
    this.assert(error, 'list audit');
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      jobId: (row.job_id as string | null) ?? null,
      userId: String(row.user_id),
      action: String(row.action),
      timestamp: String(row.created_at),
      metadata: (row.metadata as AuditEntry['metadata']) ?? {},
      prevHash: String(row.prev_hash),
      hash: String(row.hash),
    }));
  }

  async getPreferences(userId: string): Promise<UserPreferences> {
    const { data, error } = await this.client
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    this.assert(error, 'read preferences');
    if (!data) {
      return { userId, defaultTargetLang: 'en', updatedAt: new Date().toISOString() };
    }
    const row = data as { user_id: string; default_target_lang: string; updated_at: string };
    return {
      userId: row.user_id,
      defaultTargetLang: row.default_target_lang,
      updatedAt: row.updated_at,
    };
  }

  async savePreferences(prefs: UserPreferences): Promise<void> {
    const { error } = await this.client.from('user_preferences').upsert({
      user_id: prefs.userId,
      default_target_lang: prefs.defaultTargetLang,
      updated_at: prefs.updatedAt,
    });
    this.assert(error, 'save preferences');
  }

  async deleteUserData(userId: string): Promise<string[]> {
    const jobs = await this.listJobs(userId);
    const paths: string[] = [];
    for (const summary of jobs) {
      const job = await this.getJob(summary.id);
      if (!job) continue;
      paths.push(job.originalPath);
      for (const page of job.pages) {
        if (page.imagePath) paths.push(page.imagePath);
      }
    }
    const { error } = await this.client.from('jobs').delete().eq('user_id', userId);
    this.assert(error, 'delete user jobs');
    const { error: prefError } = await this.client
      .from('user_preferences')
      .delete()
      .eq('user_id', userId);
    this.assert(prefError, 'delete preferences');
    return paths;
  }

  private async hydrate(rows: JobRow[]): Promise<Job[]> {
    const jobs: Job[] = [];
    for (const row of rows) {
      jobs.push(this.fromJob(row, await this.pagesFor(row.id)));
    }
    return jobs;
  }

  private async pagesFor(jobId: string): Promise<PageRow[]> {
    const { data, error } = await this.client
      .from('job_pages')
      .select('*')
      .eq('job_id', jobId)
      .order('page_index', { ascending: true });
    this.assert(error, 'read pages');
    return (data ?? []) as PageRow[];
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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

  private toJobRow(job: Job): Record<string, string | number | null> {
    return {
      id: job.id,
      user_id: job.userId,
      status: job.status,
      source_lang: job.sourceLang,
      detected_lang: job.detectedLang,
      target_lang: job.targetLang,
      original_filename: job.originalFilename,
      original_path: job.originalPath,
      original_hash: job.originalHash,
      output_hash: job.outputHash,
      page_count: job.pageCount,
      error: job.error,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    };
  }

  private toPageRow(page: JobPage): Record<string, string | number | TextBlock[] | null> {
    return {
      id: page.id,
      job_id: page.jobId,
      page_index: page.pageIndex,
      status: page.status,
      width: page.width,
      height: page.height,
      image_path: page.imagePath,
      blocks: page.blocks,
      error: page.error,
    };
  }

  private assert(error: { message: string } | null, action: string): void {
    if (!error) return;
    this.logger.error(`database ${action} failed`);
    throw new Error(`Database ${action} failed`);
  }
}
