import { groupTokensIntoBlocks } from '../src/grouping';
import { sampleTokens } from '../src/samples';
import type { OcrToken } from '../src/types';

describe('groupTokensIntoBlocks', () => {
  it('merges an English paragraph and keeps the title separate', () => {
    const blocks = groupTokensIntoBlocks(sampleTokens('en'), { pageIndex: 0, sourceLang: 'en' });
    expect(blocks.length).toBe(2);
    expect(blocks[0]?.text).toBe('Lease agreement');
    expect(blocks[1]?.text).toContain('The tenant shall pay rent');
    expect(blocks[1]?.text).toContain('without delay.');
    expect(blocks[0]?.direction).toBe('ltr');
  });

  it('groups Arabic tokens right-to-left into a paragraph', () => {
    const blocks = groupTokensIntoBlocks(sampleTokens('ar'), { pageIndex: 1, sourceLang: 'ar' });
    expect(blocks.length).toBe(1);
    const text = blocks[0]?.text ?? '';
    expect(text.startsWith('هذا')).toBe(true);
    expect(text).toContain('شهرياً');
    expect(blocks[0]?.rtl).toBe(true);
    expect(blocks[0]?.direction).toBe('rtl');
    expect(blocks[0]?.align).toBe('right');
    expect(blocks[0]?.fontFamily).toBe('Noto Naskh Arabic');
  });

  it('keeps a German table as separate cells', () => {
    const blocks = groupTokensIntoBlocks(sampleTokens('de'), { pageIndex: 2, sourceLang: 'de' });
    const texts = blocks.map((block) => block.text);
    expect(texts).toContain('Rechnung');
    expect(texts).toContain('Artikel');
    expect(texts).toContain('Menge');
    expect(texts).toContain('Preis');
    expect(texts).toContain('Papier');
    expect(texts).toContain('12,00');
    expect(texts).toContain('Tinte');
    expect(blocks.length).toBeGreaterThanOrEqual(10);
    const joined = texts.join(' | ');
    expect(joined.includes('Artikel Menge Preis')).toBe(false);
  });

  it('keeps bold when most tokens in a block are bold', () => {
    const tokens: OcrToken[] = [
      { text: 'Bold', bbox: { x: 10, y: 10, w: 40, h: 20 }, confidence: 1, fontWeight: 'bold' },
      { text: 'title', bbox: { x: 56, y: 10, w: 40, h: 20 }, confidence: 1, fontWeight: 'bold' },
    ];
    const blocks = groupTokensIntoBlocks(tokens);
    expect(blocks[0]?.fontWeight).toBe('bold');
  });
});
