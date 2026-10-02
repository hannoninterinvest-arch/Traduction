import { getLanguage, type LanguageInfo } from './languages.js';

export interface FontChoice {
  family: string;
  cssFamily: string;
  direction: 'ltr' | 'rtl';
  script: LanguageInfo['script'];
}

const FONT_BY_SCRIPT: Record<LanguageInfo['script'], string> = {
  Latn: 'Noto Sans',
  Cyrl: 'Noto Sans',
  Grek: 'Noto Sans',
  Arab: 'Noto Naskh Arabic',
  Hebr: 'Noto Sans Hebrew',
  Deva: 'Noto Sans Devanagari',
  Thai: 'Noto Sans Thai',
  Hans: 'Noto Sans SC',
  Hant: 'Noto Sans TC',
  Jpan: 'Noto Sans JP',
  Kore: 'Noto Sans KR',
};

export function fontForLanguage(code: string): FontChoice {
  const language = getLanguage(code);
  const script = language?.script ?? 'Latn';
  const family = FONT_BY_SCRIPT[script];
  const direction = language?.rtl ? 'rtl' : 'ltr';
  return {
    family,
    cssFamily: `'${family}', 'Noto Sans', sans-serif`,
    direction,
    script,
  };
}

export function fontStyleFromName(fontName: string | undefined): {
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
} {
  const name = (fontName ?? '').toLowerCase();
  return {
    fontWeight: name.includes('bold') || name.includes('black') ? 'bold' : 'normal',
    fontStyle: name.includes('italic') || name.includes('oblique') ? 'italic' : 'normal',
  };
}
