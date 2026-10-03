import { Injectable, Logger } from '@nestjs/common';
import { isRetryableStatus, withRetry, type TranslationContext } from '@doctranslate/shared';
import { AppException } from '../common/app.exception';
import { AppConfig, type OcrProviderName, type TranslationProviderName } from '../config/env';
import {
  GoogleVisionProvider,
  MockOcrProvider,
  OcrSpaceProvider,
  TesseractProvider,
} from './ocr.providers';
import {
  AnthropicProvider,
  DeepLProvider,
  GoogleTranslateProvider,
  LibreTranslateProvider,
  MockTranslationProvider,
} from './translation.providers';
import {
  batchByChars,
  defaultHttp,
  type HttpClient,
  type OcrProvider,
  type OcrResult,
  type Translatable,
  type TranslationProvider,
  type TranslationResult,
} from './types';

@Injectable()
export class OcrEngine {
  private readonly logger = new Logger(OcrEngine.name);
  private readonly tesseract = new TesseractProvider();

  constructor(private readonly config: AppConfig) {}

  async recognize(
    image: Buffer,
    languageHints: string[],
    http: HttpClient = defaultHttp(),
  ): Promise<OcrResult> {
    try {
      return await this.run(this.config.ocrProvider, image, languageHints, http);
    } catch (error) {
      if (!this.config.ocrFallback || this.config.ocrFallback === this.config.ocrProvider) {
        throw this.asProviderError(error, 'OCR');
      }
      this.logger.warn(`ocr ${this.config.ocrProvider} failed; trying ${this.config.ocrFallback}`);
      try {
        return await this.run(this.config.ocrFallback, image, languageHints, http);
      } catch (fallbackError) {
        throw this.asProviderError(fallbackError, 'OCR');
      }
    }
  }

  private run(
    name: OcrProviderName,
    image: Buffer,
    hints: string[],
    http: HttpClient,
  ): Promise<OcrResult> {
    const provider = this.create(name, http);
    return withRetry(() => provider.recognize(image, hints), {
      retries: name === 'mock' ? 0 : 2,
      baseMs: 250,
      shouldRetry: (error) => !(error instanceof AppException) && retryable(error),
    });
  }

  private create(name: OcrProviderName, http: HttpClient): OcrProvider {
    switch (name) {
      case 'ocrspace':
        return new OcrSpaceProvider(this.config.ocrSpaceApiKey, http);
      case 'google':
        return new GoogleVisionProvider(this.config.googleApiKey, http);
      case 'tesseract':
        return this.tesseract;
      default:
        return new MockOcrProvider();
    }
  }

  private asProviderError(error: unknown, kind: string): AppException {
    if (error instanceof AppException) return error;
    this.logger.error(`${kind} provider failed`);
    return new AppException('PROVIDER_FAILURE', `${kind} failed. Try again in a moment.`, 502);
  }
}

@Injectable()
export class TranslationEngine {
  private readonly logger = new Logger(TranslationEngine.name);

  constructor(private readonly config: AppConfig) {}

  async translate(
    blocks: Translatable[],
    context: TranslationContext,
    http: HttpClient = defaultHttp(),
  ): Promise<TranslationResult> {
    const limited = blocks.filter((block) => block.text.trim().length > 0);
    try {
      return await this.run(this.config.translationProvider, limited, context, http);
    } catch (error) {
      if (
        !this.config.translationFallback ||
        this.config.translationFallback === this.config.translationProvider
      ) {
        throw this.asProviderError(error);
      }
      this.logger.warn(
        `translation ${this.config.translationProvider} failed; trying ${this.config.translationFallback}`,
      );
      try {
        return await this.run(this.config.translationFallback, limited, context, http);
      } catch (fallbackError) {
        throw this.asProviderError(fallbackError);
      }
    }
  }

  private async run(
    name: TranslationProviderName,
    blocks: Translatable[],
    context: TranslationContext,
    http: HttpClient,
  ): Promise<TranslationResult> {
    const provider = this.create(name, http);
    const glossary = [...context.glossary];
    const translated: TranslationResult['blocks'] = [];
    for (const batch of batchByChars(blocks, name === 'anthropic' ? 12000 : 4500)) {
      const result = await withRetry(() => provider.translate(batch, { ...context, glossary }), {
        retries: name === 'mock' ? 0 : 2,
        baseMs: 300,
        shouldRetry: (error) => !(error instanceof AppException) && retryable(error),
      });
      translated.push(...result.blocks);
      glossary.splice(0, glossary.length, ...result.glossary);
    }
    return { blocks: translated, glossary };
  }

  private create(name: TranslationProviderName, http: HttpClient): TranslationProvider {
    switch (name) {
      case 'google':
        return new GoogleTranslateProvider(this.config.googleApiKey, http);
      case 'deepl':
        return new DeepLProvider(this.config.deeplApiKey, http);
      case 'anthropic':
        return new AnthropicProvider(this.config.anthropicApiKey, this.config.anthropicModel, http);
      case 'libretranslate':
        return new LibreTranslateProvider(
          this.config.libreTranslateUrl,
          this.config.libreTranslateApiKey,
          http,
        );
      default:
        return new MockTranslationProvider();
    }
  }

  private asProviderError(error: unknown): AppException {
    if (error instanceof AppException) return error;
    this.logger.error('translation provider failed');
    return new AppException('PROVIDER_FAILURE', 'Translation failed. Try again in a moment.', 502);
  }
}

function retryable(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const match = error.message.match(/status (\d+)/);
  if (!match?.[1]) return true;
  return isRetryableStatus(Number(match[1]));
}
