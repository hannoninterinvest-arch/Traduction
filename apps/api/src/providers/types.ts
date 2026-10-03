import type { OcrToken, TranslationContext } from '@doctranslate/shared';

export interface OcrResult {
  tokens: OcrToken[];
  language: string | null;
}

export interface OcrProvider {
  readonly name: string;
  recognize(image: Buffer, languageHints: string[]): Promise<OcrResult>;
}

export interface Translatable {
  id: string;
  text: string;
}

export interface TranslationResult {
  blocks: Array<{ id: string; text: string }>;
  glossary: TranslationContext['glossary'];
}

export interface TranslationProvider {
  readonly name: string;
  translate(blocks: Translatable[], context: TranslationContext): Promise<TranslationResult>;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type HttpClient = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<HttpResponse>;

export function defaultHttp(): HttpClient {
  return async (url, init) => {
    const response = await fetch(url, init);
    return {
      ok: response.ok,
      status: response.status,
      json: () => response.json() as Promise<unknown>,
      text: () => response.text(),
    };
  };
}

export function batchByChars<T extends { text: string }>(items: T[], maxChars: number): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const item of items) {
    if (current.length > 0 && size + item.text.length > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
