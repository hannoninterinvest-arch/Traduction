import type { TranslationContext } from '@doctranslate/shared';
import { AppException } from '../common/app.exception';
import {
  batchByChars,
  type HttpClient,
  type Translatable,
  type TranslationProvider,
  type TranslationResult,
} from './types';

const DEEPL_UNSUPPORTED = new Set(['ar', 'he', 'fa', 'ur', 'th', 'hi']);

export class MockTranslationProvider implements TranslationProvider {
  readonly name = 'mock';

  async translate(blocks: Translatable[], context: TranslationContext): Promise<TranslationResult> {
    return {
      blocks: blocks.map((block) => ({
        id: block.id,
        text: `[${context.targetLang}] ${block.text}`,
      })),
      glossary: context.glossary,
    };
  }
}

export class GoogleTranslateProvider implements TranslationProvider {
  readonly name = 'google';

  constructor(
    private readonly apiKey: string,
    private readonly http: HttpClient,
  ) {}

  async translate(blocks: Translatable[], context: TranslationContext): Promise<TranslationResult> {
    if (!this.apiKey)
      throw new AppException('PROVIDER_FAILURE', 'Google Translate is not configured.', 502);
    const translated: TranslationResult['blocks'] = [];
    for (const batch of batchByChars(blocks, 4500)) {
      const response = await this.http(
        `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            q: batch.map((block) => block.text),
            target: context.targetLang,
            ...(context.sourceLang !== 'auto' ? { source: context.sourceLang } : {}),
            format: 'text',
          }),
        },
      );
      if (!response.ok) throw new Error(`google translate status ${response.status}`);
      const payload = (await response.json()) as {
        data?: { translations?: Array<{ translatedText?: string }> };
      };
      const rows = payload.data?.translations ?? [];
      batch.forEach((block, index) => {
        translated.push({ id: block.id, text: rows[index]?.translatedText ?? block.text });
      });
    }
    return { blocks: translated, glossary: context.glossary };
  }
}

export class DeepLProvider implements TranslationProvider {
  readonly name = 'deepl';

  constructor(
    private readonly apiKey: string,
    private readonly http: HttpClient,
  ) {}

  async translate(blocks: Translatable[], context: TranslationContext): Promise<TranslationResult> {
    if (!this.apiKey) throw new AppException('PROVIDER_FAILURE', 'DeepL is not configured.', 502);
    if (DEEPL_UNSUPPORTED.has(context.targetLang) || DEEPL_UNSUPPORTED.has(context.sourceLang)) {
      throw new AppException('PROVIDER_FAILURE', 'DeepL does not support that language.', 502);
    }
    const translated: TranslationResult['blocks'] = [];
    for (const batch of batchByChars(blocks, 4000)) {
      const params = new URLSearchParams();
      for (const block of batch) params.append('text', block.text);
      params.set('target_lang', context.targetLang.toUpperCase());
      if (context.sourceLang !== 'auto')
        params.set('source_lang', context.sourceLang.toUpperCase());
      const response = await this.http('https://api-free.deepl.com/v2/translate', {
        method: 'POST',
        headers: {
          authorization: `DeepL-Auth-Key ${this.apiKey}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      if (!response.ok) throw new Error(`deepl status ${response.status}`);
      const payload = (await response.json()) as { translations?: Array<{ text?: string }> };
      batch.forEach((block, index) => {
        translated.push({ id: block.id, text: payload.translations?.[index]?.text ?? block.text });
      });
    }
    return { blocks: translated, glossary: context.glossary };
  }
}

export class AnthropicProvider implements TranslationProvider {
  readonly name = 'anthropic';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly http: HttpClient,
  ) {}

  async translate(blocks: Translatable[], context: TranslationContext): Promise<TranslationResult> {
    if (!this.apiKey)
      throw new AppException('PROVIDER_FAILURE', 'Anthropic is not configured.', 502);
    const response = await this.http('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system:
          'Translate every document block. Reply with JSON only: {"blocks":[{"id":"","text":""}],"glossary":[{"source":"","target":""}]}. Keep the same ids. Keep numbers, proper names, and punctuation unchanged. Reuse the glossary so terminology stays consistent. Do not add commentary.',
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              sourceLang: context.sourceLang,
              targetLang: context.targetLang,
              glossary: context.glossary,
              blocks: blocks.map((block) => ({ id: block.id, text: block.text })),
            }),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`anthropic status ${response.status}`);
    const payload = (await response.json()) as { content?: Array<{ text?: string }> };
    const raw = payload.content?.map((part) => part.text ?? '').join('\n') ?? '';
    const parsed = parseModelJson(raw);
    const byId = new Map(parsed.blocks.map((block) => [block.id, block.text]));
    return {
      blocks: blocks.map((block) => ({ id: block.id, text: byId.get(block.id) ?? block.text })),
      glossary: mergeGlossary(context.glossary, parsed.glossary),
    };
  }
}

export class LibreTranslateProvider implements TranslationProvider {
  readonly name = 'libretranslate';

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly http: HttpClient,
  ) {}

  async translate(blocks: Translatable[], context: TranslationContext): Promise<TranslationResult> {
    if (!this.endpoint)
      throw new AppException('PROVIDER_FAILURE', 'LibreTranslate is not configured.', 502);
    const translated: TranslationResult['blocks'] = [];
    for (const batch of batchByChars(blocks, 4000)) {
      const separator = '\n<|block|>\n';
      const response = await this.http(`${this.endpoint.replace(/\/$/, '')}/translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          q: batch.map((block) => block.text).join(separator),
          source: context.sourceLang === 'auto' ? 'auto' : context.sourceLang,
          target: context.targetLang,
          format: 'text',
          api_key: this.apiKey || undefined,
        }),
      });
      if (!response.ok) throw new Error(`libretranslate status ${response.status}`);
      const payload = (await response.json()) as { translatedText?: string };
      const parts = (payload.translatedText ?? '').split(separator);
      batch.forEach((block, index) => {
        translated.push({ id: block.id, text: parts[index]?.trim() || block.text });
      });
    }
    return { blocks: translated, glossary: context.glossary };
  }
}

export function parseModelJson(raw: string): {
  blocks: Array<{ id: string; text: string }>;
  glossary: Array<{ source: string; target: string }>;
} {
  const fenced = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('model did not return JSON');
  const parsed = JSON.parse(fenced.slice(start, end + 1)) as {
    blocks?: Array<{ id?: string; text?: string }>;
    glossary?: Array<{ source?: string; target?: string }>;
  };
  return {
    blocks: (parsed.blocks ?? [])
      .filter((block) => block.id && typeof block.text === 'string')
      .map((block) => ({ id: String(block.id), text: String(block.text) })),
    glossary: (parsed.glossary ?? [])
      .filter((entry) => entry.source && entry.target)
      .map((entry) => ({ source: String(entry.source), target: String(entry.target) })),
  };
}

function mergeGlossary(
  current: TranslationContext['glossary'],
  extra: TranslationContext['glossary'],
): TranslationContext['glossary'] {
  const map = new Map(current.map((entry) => [entry.source, entry.target]));
  for (const entry of extra) map.set(entry.source, entry.target);
  return [...map.entries()].map(([source, target]) => ({ source, target }));
}
