export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  rtl: boolean;
  script:
    | 'Latn'
    | 'Arab'
    | 'Hebr'
    | 'Cyrl'
    | 'Grek'
    | 'Deva'
    | 'Thai'
    | 'Hans'
    | 'Hant'
    | 'Jpan'
    | 'Kore';
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true, script: 'Arab' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', rtl: true, script: 'Hebr' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true, script: 'Arab' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true, script: 'Arab' },
  { code: 'en', name: 'English', nativeName: 'English', rtl: false, script: 'Latn' },
  { code: 'fr', name: 'French', nativeName: 'Français', rtl: false, script: 'Latn' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', rtl: false, script: 'Latn' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', rtl: false, script: 'Latn' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', rtl: false, script: 'Latn' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', rtl: false, script: 'Latn' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', rtl: false, script: 'Latn' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', rtl: false, script: 'Latn' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', rtl: false, script: 'Latn' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', rtl: false, script: 'Latn' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', rtl: false, script: 'Latn' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', rtl: false, script: 'Latn' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', rtl: false, script: 'Latn' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', rtl: false, script: 'Latn' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', rtl: false, script: 'Latn' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', rtl: false, script: 'Latn' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', rtl: false, script: 'Latn' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', rtl: false, script: 'Latn' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', rtl: false, script: 'Latn' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', rtl: false, script: 'Cyrl' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', rtl: false, script: 'Cyrl' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', rtl: false, script: 'Cyrl' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', rtl: false, script: 'Grek' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', rtl: false, script: 'Deva' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', rtl: false, script: 'Thai' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '简体中文', rtl: false, script: 'Hans' },
  {
    code: 'zh-TW',
    name: 'Chinese (Traditional)',
    nativeName: '繁體中文',
    rtl: false,
    script: 'Hant',
  },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', rtl: false, script: 'Jpan' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', rtl: false, script: 'Kore' },
] as const;

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

export function getLanguage(code: string): LanguageInfo | undefined {
  return BY_CODE.get(code);
}

export function isRtlLanguage(code: string): boolean {
  return getLanguage(code)?.rtl ?? false;
}

export function isKnownLanguage(code: string): boolean {
  return code === 'auto' || BY_CODE.has(code);
}

const ISO639_3_TO_1: Record<string, string> = {
  eng: 'en',
  fra: 'fr',
  deu: 'de',
  arb: 'ar',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  nld: 'nl',
  pol: 'pl',
  swe: 'sv',
  dan: 'da',
  fin: 'fi',
  nor: 'no',
  ces: 'cs',
  ron: 'ro',
  hun: 'hu',
  tur: 'tr',
  vie: 'vi',
  ind: 'id',
  zlm: 'ms',
  rus: 'ru',
  ukr: 'uk',
  bul: 'bg',
  ell: 'el',
  hin: 'hi',
  tha: 'th',
  cmn: 'zh',
  jpn: 'ja',
  kor: 'ko',
  heb: 'he',
  pes: 'fa',
  urd: 'ur',
};

export function iso6393To1(code: string): string | null {
  return ISO639_3_TO_1[code] ?? null;
}
