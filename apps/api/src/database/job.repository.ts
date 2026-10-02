import type {
  AuditEntry,
  AuditEntryInput,
  Job,
  JobPage,
  JobSummary,
  UserPreferences,
} from '@doctranslate/shared';

export const JOB_REPOSITORY = Symbol('JOB_REPOSITORY');

export interface JobRepository {
  createJob(job: Job): Promise<void>;
  updateJob(id: string, patch: Partial<Omit<Job, 'id' | 'userId' | 'pages'>>): Promise<void>;
  getJob(id: string): Promise<Job | null>;
  listJobs(userId: string): Promise<JobSummary[]>;
  listUnfinished(): Promise<Job[]>;
  listExpired(cutoffIso: string): Promise<Job[]>;
  deleteJob(id: string): Promise<void>;
  replacePage(page: JobPage): Promise<void>;
  pagesUsedThisMonth(userId: string): Promise<number>;
  appendAudit(input: AuditEntryInput): Promise<AuditEntry>;
  listAuditForUser(userId: string): Promise<AuditEntry[]>;
  getPreferences(userId: string): Promise<UserPreferences>;
  savePreferences(prefs: UserPreferences): Promise<void>;
  /** Removes jobs, pages, and preferences. Returns storage paths. Audit rows stay intact. */
  deleteUserData(userId: string): Promise<string[]>;
}
