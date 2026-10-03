import type { BBox, OcrToken } from './types';

export type SampleKind = 'en' | 'ar' | 'de';

function token(
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  confidence = 0.98,
): OcrToken {
  return { text, bbox: { x, y, w, h }, confidence };
}

export function englishSampleTokens(): OcrToken[] {
  const line = (words: string[], y: number, startX = 80): OcrToken[] => {
    let x = startX;
    return words.map((word) => {
      const width = Math.max(18, word.length * 14);
      const item = token(word, x, y, width, 28);
      x += width + 10;
      return item;
    });
  };
  return [
    token('Lease', 80, 70, 90, 36),
    token('agreement', 180, 72, 180, 34),
    ...line(['The', 'tenant', 'shall', 'pay', 'rent', 'on', 'the', 'first'], 160),
    ...line(['day', 'of', 'each', 'month', 'without', 'delay.'], 198),
  ];
}

export function arabicSampleTokens(): OcrToken[] {
  const words = ['هذا', 'عقد', 'إيجار', 'بين', 'الطرفين'];
  let x = 620;
  const line: OcrToken[] = words.map((word) => {
    const width = 70;
    x -= width + 12;
    return token(word, x, 140, width, 32);
  });
  const second = ['يجب', 'دفع', 'الأجرة', 'شهرياً'];
  let x2 = 620;
  const line2: OcrToken[] = second.map((word) => {
    const width = 78;
    x2 -= width + 12;
    return token(word, x2, 186, width, 32);
  });
  return [...line, ...line2];
}

export function germanTableTokens(): OcrToken[] {
  const cell = (text: string, box: BBox): OcrToken => token(text, box.x, box.y, box.w, box.h);
  const rows = [
    ['Artikel', 'Menge', 'Preis'],
    ['Papier', '2', '12,00'],
    ['Tinte', '1', '8,50'],
  ];
  const xs = [70, 280, 430];
  const widths = [140, 80, 90];
  const tokens: OcrToken[] = [token('Rechnung', 70, 60, 160, 34)];
  rows.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const x = xs[colIndex] ?? 70;
      const w = widths[colIndex] ?? 80;
      tokens.push(cell(value, { x, y: 130 + rowIndex * 48, w, h: 28 }));
    });
  });
  return tokens;
}

export function sampleTokens(kind: SampleKind): OcrToken[] {
  switch (kind) {
    case 'ar':
      return arabicSampleTokens();
    case 'de':
      return germanTableTokens();
    default:
      return englishSampleTokens();
  }
}

export function samplePageSize(kind: SampleKind): { width: number; height: number } {
  if (kind === 'ar') return { width: 800, height: 500 };
  return { width: 700, height: 480 };
}
