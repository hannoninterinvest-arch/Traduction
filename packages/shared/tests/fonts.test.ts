import { fontForLanguage, fontStyleFromName } from '../src/fonts';

describe('fontForLanguage', () => {
  it.each([
    ['en', 'Noto Sans', 'ltr'],
    ['fr', 'Noto Sans', 'ltr'],
    ['de', 'Noto Sans', 'ltr'],
    ['ru', 'Noto Sans', 'ltr'],
    ['el', 'Noto Sans', 'ltr'],
    ['ar', 'Noto Naskh Arabic', 'rtl'],
    ['fa', 'Noto Naskh Arabic', 'rtl'],
    ['ur', 'Noto Naskh Arabic', 'rtl'],
    ['he', 'Noto Sans Hebrew', 'rtl'],
    ['hi', 'Noto Sans Devanagari', 'ltr'],
    ['th', 'Noto Sans Thai', 'ltr'],
    ['zh', 'Noto Sans SC', 'ltr'],
    ['zh-TW', 'Noto Sans TC', 'ltr'],
    ['ja', 'Noto Sans JP', 'ltr'],
    ['ko', 'Noto Sans KR', 'ltr'],
  ] as const)('maps %s to %s (%s)', (code, family, direction) => {
    const font = fontForLanguage(code);
    expect(font.family).toBe(family);
    expect(font.direction).toBe(direction);
  });

  it('reads bold and italic from a PDF font name', () => {
    expect(fontStyleFromName('NotoSans-BoldItalic')).toEqual({
      fontWeight: 'bold',
      fontStyle: 'italic',
    });
    expect(fontStyleFromName('Helvetica')).toEqual({
      fontWeight: 'normal',
      fontStyle: 'normal',
    });
  });
});
