import { z } from 'zod';
import { JOB_STATUSES, MIME_TYPES, PAGE_STATUSES } from './types';

export const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});

export const createUploadSchema = z.object({
  filename: z.string().min(1).max(240),
  contentType: z.enum(MIME_TYPES),
  size: z.number().int().positive(),
});

export const createJobSchema = z.object({
  path: z.string().min(1).max(500),
  filename: z.string().min(1).max(240),
  contentType: z.enum(MIME_TYPES),
  size: z.number().int().positive(),
  targetLang: z.string().min(2).max(16),
  sourceLang: z.string().min(2).max(16).default('auto'),
});

export const updateBlockSchema = z.object({
  translatedText: z.string().max(20000).optional(),
  fontSize: z.number().min(4).max(120).optional(),
  bbox: bboxSchema.optional(),
  renderBBox: bboxSchema.optional(),
});

export const updatePreferencesSchema = z.object({
  defaultTargetLang: z.string().min(2).max(16),
});

export const verifyHashSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const completeExportSchema = z.object({
  outputHash: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const jobStatusSchema = z.enum(JOB_STATUSES);
export const pageStatusSchema = z.enum(PAGE_STATUSES);

export type CreateUploadInput = z.infer<typeof createUploadSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateBlockInput = z.infer<typeof updateBlockSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
