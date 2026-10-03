export const JOB_STATUSES = ['queued', 'processing', 'done', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const PAGE_STATUSES = [
  'queued',
  'ocr',
  'translating',
  'rendering',
  'done',
  'failed',
] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

export const SOURCE_OVERRIDE_LANGS = ['ar', 'en', 'fr', 'de'] as const;
export type WellSupportedSource = (typeof SOURCE_OVERRIDE_LANGS)[number];

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrToken {
  text: string;
  bbox: BBox;
  confidence: number;
  lineId?: string;
  rtl?: boolean;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
}

export interface TextBlock {
  id: string;
  text: string;
  translatedText: string;
  bbox: BBox;
  renderBBox: BBox;
  confidence: number;
  rtl: boolean;
  direction: 'ltr' | 'rtl';
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  backgroundColor: string;
  align: 'left' | 'right' | 'center';
  sourceLang?: string;
  lineIds: string[];
}

export interface JobPage {
  id: string;
  jobId: string;
  pageIndex: number;
  status: PageStatus;
  width: number;
  height: number;
  imagePath: string | null;
  blocks: TextBlock[];
  error: string | null;
}

export interface Job {
  id: string;
  userId: string;
  status: JobStatus;
  sourceLang: string;
  detectedLang: string | null;
  targetLang: string;
  originalFilename: string;
  originalPath: string;
  originalHash: string | null;
  outputHash: string | null;
  pageCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  pages: JobPage[];
}

export interface JobSummary {
  id: string;
  status: JobStatus;
  sourceLang: string;
  detectedLang: string | null;
  targetLang: string;
  originalFilename: string;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

export interface UserPreferences {
  userId: string;
  defaultTargetLang: string;
  updatedAt: string;
}

export interface AuditEntryInput {
  jobId: string | null;
  userId: string;
  action: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AuditEntry extends AuditEntryInput {
  prevHash: string;
  hash: string;
}

export interface TranslationContext {
  glossary: Array<{ source: string; target: string }>;
  pageIndex: number;
  targetLang: string;
  sourceLang: string;
}

export interface SignedUpload {
  mode: 'supabase' | 'direct';
  path: string;
  token: string;
  signedUrl: string | null;
  uploadUrl: string | null;
  bucket: string;
}

export type AppErrorCode =
  | 'UNSUPPORTED_FILE'
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_PAGES'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_FAILURE'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'INTERNAL';

export interface AppErrorBody {
  code: AppErrorCode;
  message: string;
}

export const MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type SupportedMime = (typeof MIME_TYPES)[number];
