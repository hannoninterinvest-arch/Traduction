import { GoogleTranslateProvider, parseModelJson } from '../src/providers/translation.providers';
import { TranslationEngine } from '../src/providers/engines';
import { OcrEngine } from '../src/providers/engines';
import { AppConfig } from '../src/config/env';
import { batchByChars, type HttpClient } from '../src/providers/types';
import { withRetry } from '@doctranslate/shared';

describe('providers', () => {
  const previous = { ...process.env };

  afterEach(() => {
    process.env = { ...previous };
  });

  it('splits blocks before they exceed a provider payload limit', () => {
    const batches = batchByChars(
      [
        { id: 'a', text: 'x'.repeat(30) },
        { id: 'b', text: 'y'.repeat(30) },
        { id: 'c', text: 'z'.repeat(10) },
      ],
      40,
    );
    expect(batches).toHaveLength(2);
    expect(batches[0]?.map((item) => item.id)).toEqual(['a']);
    expect(batches[1]?.map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('retries a translation call and then reads the payload', async () => {
    let calls = 0;
    const http: HttpClient = async () => {
      calls += 1;
      if (calls < 3)
        return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ data: { translations: [{ translatedText: 'Bonjour' }] } }),
      };
    };
    const provider = new GoogleTranslateProvider('key', http);
    const result = await withRetry(
      () => provider.translate([{ id: '1', text: 'Hello' }], blankContext()),
      {
        retries: 3,
        sleep: async () => undefined,
        shouldRetry: (error) => error instanceof Error && error.message.includes('503'),
      },
    );
    expect(calls).toBe(3);
    expect(result.blocks[0]?.text).toBe('Bonjour');
  });

  it('falls back to the secondary translation provider', async () => {
    process.env.TRANSLATION_PROVIDER = 'google';
    process.env.TRANSLATION_FALLBACK_PROVIDER = 'mock';
    process.env.GOOGLE_API_KEY = 'key';
    process.env.NODE_ENV = 'test';
    process.env.AUTH_MODE = 'dev';
    const config = new AppConfig();
    const engine = new TranslationEngine(config);
    const http: HttpClient = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => '',
    });
    const result = await engine.translate([{ id: '1', text: 'Hello' }], blankContext(), http);
    expect(result.blocks[0]?.text).toBe('[fr] Hello');
  });

  it('falls back to the secondary OCR provider', async () => {
    process.env.OCR_PROVIDER = 'google';
    process.env.OCR_FALLBACK_PROVIDER = 'mock';
    process.env.GOOGLE_API_KEY = 'key';
    process.env.NODE_ENV = 'test';
    process.env.AUTH_MODE = 'dev';
    const engine = new OcrEngine(new AppConfig());
    const http: HttpClient = async () => {
      throw new Error('vision status 503');
    };
    const result = await engine.recognize(Buffer.from('img'), ['de'], http);
    expect(result.tokens.map((token) => token.text)).toContain('Rechnung');
  });

  it('parses an Anthropic JSON payload and keeps ids', () => {
    const parsed = parseModelJson(
      '```json\n{"blocks":[{"id":"p0-b1","text":"عقد"}],"glossary":[{"source":"Lease","target":"عقد"}]}\n```',
    );
    expect(parsed.blocks[0]).toEqual({ id: 'p0-b1', text: 'عقد' });
    expect(parsed.glossary[0]?.source).toBe('Lease');
  });
});

function blankContext() {
  return { glossary: [], pageIndex: 0, sourceLang: 'en', targetLang: 'fr' };
}
