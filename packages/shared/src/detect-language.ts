import { iso6393To1 } from './languages';

function heuristicLanguage(text: string): string | null {
  const sample = text.trim();
  if (sample.length < 12) return null;
  const arabic = (sample.match(/[\u0600-\u06FF]/g) ?? []).length;
  const letters = (sample.match(/\p{L}/gu) ?? []).length;
  if (letters > 0 && arabic / letters > 0.4) return 'ar';
  const lowered = sample.toLowerCase();
  if (/\b(der|die|das|und|nicht|mieter)\b/.test(lowered)) return 'de';
  if (/\b(le|la|les|des|une|est|pour|dans)\b/.test(lowered)) return 'fr';
  if (/\b(the|and|shall|with|from|this)\b/.test(lowered)) return 'en';
  return null;
}

export async function detectLanguage(text: string): Promise<string | null> {
  const sample = text.replace(/\s+/g, ' ').trim();
  if (sample.length < 12) return null;
  try {
    const loaded = (await import('franc-min')) as {
      franc?: (value: string, options?: { minLength?: number }) => string;
    };
    const code = loaded.franc?.(sample, { minLength: 12 });
    if (code && code !== 'und') {
      return iso6393To1(code) ?? heuristicLanguage(sample);
    }
  } catch {
    return heuristicLanguage(sample);
  }
  return heuristicLanguage(sample);
}
