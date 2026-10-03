const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const HEBREW = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
const CJK = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

export function isRtlText(text: string): boolean {
  const rtl = (text.match(new RegExp(`${ARABIC.source}|${HEBREW.source}`, 'g')) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return false;
  return rtl / letters >= 0.3;
}

export type WidthClass = 'latin' | 'arabic' | 'cjk' | 'thai';

export function widthClass(text: string): WidthClass {
  if (CJK.test(text)) return 'cjk';
  if (ARABIC.test(text) || HEBREW.test(text)) return 'arabic';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'thai';
  return 'latin';
}

export function charWidthRatio(text: string): number {
  switch (widthClass(text)) {
    case 'cjk':
      return 1;
    case 'arabic':
      return 0.48;
    case 'thai':
      return 0.55;
    default:
      return 0.56;
  }
}

export function joinsWithoutSpace(left: string, right: string): boolean {
  return CJK.test(left) && CJK.test(right);
}
