import { sampleTokens, type OcrToken, type SampleKind } from '@doctranslate/shared';
import { AppException } from '../common/app.exception';
import type { HttpClient, OcrProvider, OcrResult } from './types';

export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock';

  async recognize(_image: Buffer, languageHints: string[]): Promise<OcrResult> {
    const hint = languageHints.find(
      (code): code is SampleKind => code === 'ar' || code === 'de' || code === 'en',
    );
    return { tokens: sampleTokens(hint ?? 'en'), language: hint ?? 'en' };
  }
}

export class OcrSpaceProvider implements OcrProvider {
  readonly name = 'ocrspace';

  constructor(
    private readonly apiKey: string,
    private readonly http: HttpClient,
  ) {}

  async recognize(image: Buffer, languageHints: string[]): Promise<OcrResult> {
    if (!this.apiKey)
      throw new AppException('PROVIDER_FAILURE', 'OCR.space is not configured.', 502);
    const language = ocrSpaceLanguage(languageHints[0]);
    const body = new URLSearchParams({
      base64Image: `data:image/png;base64,${image.toString('base64')}`,
      language,
      isOverlayRequired: 'true',
      OCREngine: '2',
      scale: 'true',
      apikey: this.apiKey,
    });
    const response = await this.http('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) throw new Error(`ocr.space status ${response.status}`);
    const payload = (await response.json()) as {
      IsErroredOnProcessing?: boolean;
      ParsedResults?: Array<{
        TextOverlay?: {
          Lines?: Array<{
            Words?: Array<{
              WordText?: string;
              Left?: number;
              Top?: number;
              Width?: number;
              Height?: number;
            }>;
            LineText?: string;
          }>;
        };
      }>;
    };
    if (payload.IsErroredOnProcessing) throw new Error('ocr.space rejected the image');
    const tokens: OcrToken[] = [];
    for (const result of payload.ParsedResults ?? []) {
      for (const line of result.TextOverlay?.Lines ?? []) {
        for (const word of line.Words ?? []) {
          const text = word.WordText?.trim() ?? '';
          if (!text) continue;
          tokens.push({
            text,
            confidence: 0.8,
            bbox: {
              x: word.Left ?? 0,
              y: word.Top ?? 0,
              w: Math.max(1, word.Width ?? 1),
              h: Math.max(1, word.Height ?? 1),
            },
          });
        }
      }
    }
    return { tokens, language: languageHints[0] ?? null };
  }
}

export class GoogleVisionProvider implements OcrProvider {
  readonly name = 'google';

  constructor(
    private readonly apiKey: string,
    private readonly http: HttpClient,
  ) {}

  async recognize(image: Buffer, languageHints: string[]): Promise<OcrResult> {
    if (!this.apiKey)
      throw new AppException('PROVIDER_FAILURE', 'Google Vision is not configured.', 502);
    const response = await this.http(
      `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image.toString('base64') },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
              imageContext: { languageHints: languageHints.slice(0, 5) },
            },
          ],
        }),
      },
    );
    if (!response.ok) throw new Error(`vision status ${response.status}`);
    const payload = (await response.json()) as {
      responses?: Array<{
        fullTextAnnotation?: {
          pages?: Array<{
            property?: { detectedLanguages?: Array<{ languageCode?: string }> };
            blocks?: Array<{
              paragraphs?: Array<{
                words?: Array<{
                  confidence?: number;
                  boundingBox?: { vertices?: Array<{ x?: number; y?: number }> };
                  symbols?: Array<{ text?: string }>;
                }>;
              }>;
            }>;
          }>;
        };
      }>;
    };
    const page = payload.responses?.[0]?.fullTextAnnotation?.pages?.[0];
    const tokens: OcrToken[] = [];
    for (const block of page?.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = (word.symbols ?? []).map((symbol) => symbol.text ?? '').join('');
          if (!text.trim()) continue;
          const vertices = word.boundingBox?.vertices ?? [];
          const xs = vertices.map((vertex) => vertex.x ?? 0);
          const ys = vertices.map((vertex) => vertex.y ?? 0);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          tokens.push({
            text,
            confidence: word.confidence ?? 0.5,
            bbox: {
              x: minX,
              y: minY,
              w: Math.max(1, Math.max(...xs) - minX),
              h: Math.max(1, Math.max(...ys) - minY),
            },
          });
        }
      }
    }
    const detected = page?.property?.detectedLanguages?.[0]?.languageCode ?? null;
    return { tokens, language: detected };
  }
}

export class TesseractProvider implements OcrProvider {
  readonly name = 'tesseract';
  private workerPromise: Promise<{
    recognize: (
      image: Buffer,
    ) => Promise<{
      data: {
        words?: Array<{
          text: string;
          confidence: number;
          bbox: { x0: number; y0: number; x1: number; y1: number };
        }>;
      };
    }>;
    terminate: () => Promise<unknown>;
  }> | null = null;

  async recognize(image: Buffer, languageHints: string[]): Promise<OcrResult> {
    const worker = await this.worker();
    const result = await worker.recognize(image);
    const tokens: OcrToken[] = [];
    for (const word of result.data.words ?? []) {
      const text = word.text?.trim();
      if (!text) continue;
      tokens.push({
        text,
        confidence: Math.max(0, Math.min(1, (word.confidence ?? 0) / 100)),
        bbox: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          w: Math.max(1, word.bbox.x1 - word.bbox.x0),
          h: Math.max(1, word.bbox.y1 - word.bbox.y0),
        },
      });
    }
    return { tokens, language: languageHints[0] ?? null };
  }

  async terminate(): Promise<void> {
    if (!this.workerPromise) return;
    const worker = await this.workerPromise;
    await worker.terminate();
    this.workerPromise = null;
  }

  private worker() {
    this.workerPromise ??= this.createWorker();
    return this.workerPromise;
  }

  private async createWorker() {
    const tesseract = (await import('tesseract.js')) as unknown as {
      createWorker: (langs: string) => Promise<{
        recognize: (image: Buffer) => Promise<{
          data: {
            words?: Array<{
              text: string;
              confidence: number;
              bbox: { x0: number; y0: number; x1: number; y1: number };
            }>;
          };
        }>;
        terminate: () => Promise<unknown>;
      }>;
    };
    return tesseract.createWorker('ara+eng+fra+deu');
  }
}

function ocrSpaceLanguage(code: string | undefined): string {
  switch (code) {
    case 'ar':
      return 'ara';
    case 'de':
      return 'ger';
    case 'fr':
      return 'fre';
    default:
      return 'eng';
  }
}
