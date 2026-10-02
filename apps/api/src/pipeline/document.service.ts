import { createRequire } from 'node:module';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { OcrToken, SupportedMime } from '@doctranslate/shared';
import { AppException } from '../common/app.exception';
import { AppConfig } from '../config/env';

/** Rasterize PDF pages at 150 DPI, then display them at 96 CSS pixels per inch. */
export const PDF_RASTER_SCALE = 150 / 72;
export const PDF_CSS_SCALE = 96 / 150;

export interface PreparedPage {
  index: number;
  width: number;
  height: number;
  image: Buffer | null;
  tokens: OcrToken[] | null;
  /** Multiply stored pixel geometry by this to get CSS pixels. Images stay at 1. */
  displayScale: number;
}

interface PdfTextItem {
  str?: string;
  width?: number;
  height?: number;
  transform?: number[];
  fontName?: string;
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(private readonly config: AppConfig) {}

  async countPages(file: Buffer, mime: SupportedMime): Promise<number> {
    if (mime !== 'application/pdf') return 1;
    const doc = await this.loadPdf(file);
    try {
      return doc.numPages;
    } finally {
      await doc.destroy();
    }
  }

  async *eachPage(file: Buffer, mime: SupportedMime): AsyncGenerator<PreparedPage> {
    if (mime !== 'application/pdf') {
      yield await this.imagePage(file);
      return;
    }
    const doc = await this.loadPdf(file);
    try {
      for (let number = 1; number <= doc.numPages; number += 1) {
        const page = await doc.getPage(number);
        const viewport = page.getViewport({ scale: PDF_RASTER_SCALE });
        const text = (await page.getTextContent()) as { items: PdfTextItem[] };
        const tokens = tokensFromText(
          text.items,
          viewport.width,
          viewport.height,
          PDF_RASTER_SCALE,
        );
        const image = await this.renderPage(page, viewport.width, viewport.height);
        page.cleanup();
        yield {
          index: number - 1,
          width: Math.ceil(viewport.width),
          height: Math.ceil(viewport.height),
          image,
          tokens: tokens.length > 0 ? tokens : null,
          displayScale: PDF_CSS_SCALE,
        };
      }
    } finally {
      await doc.destroy();
    }
  }

  private async imagePage(file: Buffer): Promise<PreparedPage> {
    const sharp = (await import('sharp')).default;
    let pipeline = sharp(file, { failOn: 'none' }).rotate();
    if (this.config.preprocessImages) {
      const angle = await estimateDeskew(file);
      pipeline = sharp(file, { failOn: 'none' }).rotate(angle).normalize();
    }
    const rendered = await pipeline.png().toBuffer({ resolveWithObject: true });
    return {
      index: 0,
      width: rendered.info.width,
      height: rendered.info.height,
      image: rendered.data,
      tokens: null,
      displayScale: 1,
    };
  }

  private async loadPdf(file: Buffer) {
    await installCanvasGlobals();
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.js')) as {
      getDocument: (src: {
        data: Uint8Array;
        disableWorker: boolean;
        isEvalSupported: boolean;
        verbosity?: number;
        standardFontDataUrl?: string;
      }) => {
        promise: Promise<{
          numPages: number;
          getPage: (n: number) => Promise<PdfPage>;
          destroy: () => Promise<void>;
        }>;
      };
    };
    try {
      return await pdfjs.getDocument({
        data: new Uint8Array(file),
        disableWorker: true,
        isEvalSupported: false,
        verbosity: 0,
        standardFontDataUrl: standardFontDataUrl(),
      }).promise;
    } catch {
      throw new AppException(
        'UNSUPPORTED_FILE',
        'That PDF could not be read. Export it again and retry.',
        415,
      );
    }
  }

  private async renderPage(page: PdfPage, width: number, height: number): Promise<Buffer | null> {
    try {
      await installCanvasGlobals();
      const canvasModule = (await import('@napi-rs/canvas')) as {
        createCanvas: (
          w: number,
          h: number,
        ) => {
          width: number;
          height: number;
          getContext: (kind: '2d') => unknown;
          toBuffer: (type: 'image/png') => Buffer;
        };
      };
      const canvas = canvasModule.createCanvas(Math.ceil(width), Math.ceil(height));
      const context = canvas.getContext('2d');
      const factory = new NodeCanvasFactory(canvasModule.createCanvas);
      await page.render({
        canvasContext: context,
        viewport: page.getViewport({ scale: PDF_RASTER_SCALE }),
        canvasFactory: factory,
      }).promise;
      const png = canvas.toBuffer('image/png');
      canvas.width = 0;
      canvas.height = 0;
      return png;
    } catch {
      this.logger.warn('page raster skipped');
      return null;
    }
  }
}

interface PdfPage {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<unknown>;
  render: (opts: { canvasContext: unknown; viewport: unknown; canvasFactory?: unknown }) => {
    promise: Promise<void>;
  };
  cleanup: () => void;
}

class NodeCanvasFactory {
  constructor(
    private readonly createCanvas: (
      w: number,
      h: number,
    ) => { width: number; height: number; getContext: (k: '2d') => unknown },
  ) {}

  create(width: number, height: number) {
    const canvas = this.createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(pair: { canvas: { width: number; height: number } }, width: number, height: number) {
    pair.canvas.width = width;
    pair.canvas.height = height;
  }

  destroy(pair: { canvas: { width: number; height: number } }) {
    pair.canvas.width = 0;
    pair.canvas.height = 0;
  }
}

const nodeRequire = createRequire(__filename);

function standardFontDataUrl(): string {
  const root = path.dirname(nodeRequire.resolve('pdfjs-dist/package.json'));
  return path.join(root, 'standard_fonts') + path.sep;
}

async function installCanvasGlobals(): Promise<void> {
  const canvas = (await import('@napi-rs/canvas')) as {
    DOMMatrix?: unknown;
    Path2D?: unknown;
  };
  const target = globalThis as { DOMMatrix?: unknown; Path2D?: unknown };
  if (canvas.DOMMatrix && !target.DOMMatrix) target.DOMMatrix = canvas.DOMMatrix;
  if (canvas.Path2D && !target.Path2D) target.Path2D = canvas.Path2D;
}

function tokensFromText(
  items: PdfTextItem[],
  pageWidth: number,
  pageHeight: number,
  scale: number,
): OcrToken[] {
  const tokens: OcrToken[] = [];
  for (const item of items) {
    const text = item.str?.trim() ?? '';
    if (!text || !item.transform) continue;
    const [a, b, c, d, e, f] = item.transform;
    if (a === undefined || e === undefined || f === undefined) continue;
    const fontSize =
      (Math.hypot(c ?? 0, d ?? 0) || Math.hypot(a, b ?? 0) || item.height || 12) * scale;
    const width = Math.max(1, (item.width ?? text.length * (fontSize / scale) * 0.5) * scale);
    const height = Math.max(1, fontSize);
    const x = e * scale;
    const y = pageHeight - f * scale - height;
    const fontName = item.fontName ?? '';
    tokens.push({
      text,
      confidence: 0.99,
      bbox: {
        x: clamp(x, 0, pageWidth),
        y: clamp(y, 0, pageHeight),
        w: width,
        h: height,
      },
      ...(fontName.toLowerCase().includes('bold') ? { fontWeight: 'bold' as const } : {}),
      ...(fontName.toLowerCase().includes('italic') || fontName.toLowerCase().includes('oblique')
        ? { fontStyle: 'italic' as const }
        : {}),
    });
  }
  return tokens;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function estimateDeskew(file: Buffer): Promise<number> {
  const sharp = (await import('sharp')).default;
  let bestAngle = 0;
  let bestScore = -1;
  for (const angle of [-2, -1, 0, 1, 2]) {
    const { data, info } = await sharp(file, { failOn: 'none' })
      .rotate(angle)
      .resize({ width: 320, withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const score = projectionScore(data, info.width, info.height);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

function projectionScore(pixels: Buffer, width: number, height: number): number {
  const rows = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    let ink = 0;
    for (let x = 0; x < width; x += 1) {
      const value = pixels[y * width + x] ?? 255;
      if (value < 160) ink += 1;
    }
    rows[y] = ink;
  }
  const mean = rows.reduce((sum, value) => sum + value, 0) / Math.max(1, rows.length);
  return rows.reduce((sum, value) => sum + (value - mean) ** 2, 0);
}
