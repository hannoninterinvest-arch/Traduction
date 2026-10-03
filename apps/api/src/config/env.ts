import { Injectable } from '@nestjs/common';

export type DataDriver = 'memory' | 'supabase' | 'postgres';
export type AuthMode = 'dev' | 'supabase';
export type OcrProviderName = 'mock' | 'ocrspace' | 'google' | 'tesseract';
export type TranslationProviderName = 'mock' | 'google' | 'deepl' | 'anthropic' | 'libretranslate';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === '1' || value === 'true';
}

function int(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

@Injectable()
export class AppConfig {
  readonly nodeEnv: string;
  readonly port: number;
  readonly apiPublicUrl: string;
  readonly webOrigins: string[];
  readonly logLevel: string;
  readonly dataDriver: DataDriver;
  readonly databaseUrl: string;
  readonly authMode: AuthMode;
  readonly tokenSecret: string;
  readonly supabaseUrl: string;
  readonly supabaseServiceRoleKey: string;
  readonly supabaseJwtSecret: string;
  readonly ocrProvider: OcrProviderName;
  readonly ocrFallback: OcrProviderName | '';
  readonly translationProvider: TranslationProviderName;
  readonly translationFallback: TranslationProviderName | '';
  readonly pdfRenderer: 'client' | 'server';
  readonly preprocessImages: boolean;
  readonly maxUploadBytes: number;
  readonly maxPages: number;
  readonly monthlyPageQuota: number;
  readonly retentionHours: number;
  readonly swaggerEnabled: boolean;
  readonly ocrSpaceApiKey: string;
  readonly googleApiKey: string;
  readonly deeplApiKey: string;
  readonly anthropicApiKey: string;
  readonly anthropicModel: string;
  readonly libreTranslateUrl: string;
  readonly libreTranslateApiKey: string;
  readonly anchorEnabled: boolean;
  readonly anchorRpcUrl: string;
  readonly anchorPrivateKey: string;
  readonly anchorChain: string;

  constructor() {
    const env = process.env;
    this.nodeEnv = env.NODE_ENV ?? 'development';
    this.port = int(env.PORT, 3001);
    this.apiPublicUrl = (env.API_PUBLIC_URL ?? `http://localhost:${this.port}`).replace(/\/$/, '');
    this.webOrigins = (env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    this.logLevel = env.LOG_LEVEL ?? 'info';
    this.dataDriver = parseDataDriver(env.DATA_DRIVER);
    this.databaseUrl = env.DATABASE_URL ?? '';
    this.authMode = env.AUTH_MODE === 'supabase' ? 'supabase' : 'dev';
    this.tokenSecret = env.TOKEN_SECRET ?? 'dev-only-token-secret-change-me';
    this.supabaseUrl = env.SUPABASE_URL ?? '';
    this.supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    this.supabaseJwtSecret = env.SUPABASE_JWT_SECRET ?? '';
    this.ocrProvider = parseOcr(env.OCR_PROVIDER);
    this.ocrFallback = env.OCR_FALLBACK_PROVIDER ? parseOcr(env.OCR_FALLBACK_PROVIDER) : '';
    this.translationProvider = parseTranslation(env.TRANSLATION_PROVIDER);
    this.translationFallback = env.TRANSLATION_FALLBACK_PROVIDER
      ? parseTranslation(env.TRANSLATION_FALLBACK_PROVIDER)
      : '';
    this.pdfRenderer = env.PDF_RENDERER === 'server' ? 'server' : 'client';
    this.preprocessImages = bool(env.PREPROCESS_IMAGES, false);
    this.maxUploadBytes = int(env.MAX_UPLOAD_BYTES, 15 * 1024 * 1024);
    this.maxPages = int(env.MAX_PAGES, 20);
    this.monthlyPageQuota = int(env.MONTHLY_PAGE_QUOTA, 100);
    this.retentionHours = int(env.RETENTION_HOURS, 24);
    this.swaggerEnabled =
      this.nodeEnv === 'production'
        ? bool(env.SWAGGER_ENABLED, false)
        : bool(env.SWAGGER_ENABLED, true);
    this.ocrSpaceApiKey = env.OCR_SPACE_API_KEY ?? '';
    this.googleApiKey = env.GOOGLE_API_KEY ?? '';
    this.deeplApiKey = env.DEEPL_API_KEY ?? '';
    this.anthropicApiKey = env.ANTHROPIC_API_KEY ?? '';
    this.anthropicModel = env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest';
    this.libreTranslateUrl = env.LIBRETRANSLATE_URL ?? '';
    this.libreTranslateApiKey = env.LIBRETRANSLATE_API_KEY ?? '';
    this.anchorEnabled = bool(env.ANCHOR_ENABLED, false);
    this.anchorRpcUrl = env.ANCHOR_RPC_URL ?? '';
    this.anchorPrivateKey = env.ANCHOR_PRIVATE_KEY ?? '';
    this.anchorChain = env.ANCHOR_CHAIN ?? 'amoy';

    if (this.authMode === 'dev' && this.nodeEnv === 'production') {
      throw new Error('AUTH_MODE=dev is refused when NODE_ENV=production');
    }
    if (this.dataDriver === 'supabase' && (!this.supabaseUrl || !this.supabaseServiceRoleKey)) {
      throw new Error('DATA_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }
    if (this.dataDriver === 'postgres' && !this.databaseUrl) {
      throw new Error('DATA_DRIVER=postgres requires DATABASE_URL (Neon connection string)');
    }
  }
}

function parseDataDriver(value: string | undefined): DataDriver {
  if (value === 'supabase') return 'supabase';
  if (value === 'postgres' || value === 'neon') return 'postgres';
  return 'memory';
}

function parseOcr(value: string | undefined): OcrProviderName {
  if (value === 'ocrspace' || value === 'google' || value === 'tesseract') return value;
  return 'mock';
}

function parseTranslation(value: string | undefined): TranslationProviderName {
  if (
    value === 'google' ||
    value === 'deepl' ||
    value === 'anthropic' ||
    value === 'libretranslate'
  ) {
    return value;
  }
  return 'mock';
}
