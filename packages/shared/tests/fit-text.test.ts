import { freeSpaceBelow, shrinkToFit, wrapText } from '../src/fit-text';

describe('shrinkToFit', () => {
  it('keeps a short line close to the box height', () => {
    const fitted = shrinkToFit({
      text: 'Rent due',
      bbox: { x: 10, y: 10, w: 240, h: 36 },
    });
    expect(fitted.lines).toEqual(['Rent due']);
    expect(fitted.fontSize).toBeGreaterThan(18);
    expect(fitted.extraHeight).toBeLessThanOrEqual(4);
  });

  it('shrinks a long translation until it fits', () => {
    const fitted = shrinkToFit({
      text: 'The monthly rent shall be paid in full on the first business day of every calendar month without exception or delay by the tenant.',
      bbox: { x: 40, y: 80, w: 220, h: 48 },
      minFontSize: 8,
      maxFontSize: 32,
    });
    expect(fitted.fontSize).toBeLessThan(20);
    expect(fitted.lines.length).toBeGreaterThan(1);
    const used = fitted.lines.length * fitted.lineHeight;
    expect(used).toBeLessThanOrEqual(fitted.renderBBox.h + 2);
  });

  it('grows downward only until the next block', () => {
    const bbox = { x: 10, y: 10, w: 80, h: 20 };
    const neighbor = { x: 10, y: 50, w: 80, h: 20 };
    expect(freeSpaceBelow(bbox, [neighbor], 400)).toBe(20);
    const fitted = shrinkToFit({
      text: 'One two three four five six seven eight nine ten eleven twelve',
      bbox,
      neighbors: [neighbor],
      pageHeight: 400,
      minFontSize: 8,
      maxFontSize: 18,
      maxGrow: 200,
    });
    expect(fitted.renderBBox.y + fitted.renderBBox.h).toBeLessThanOrEqual(neighbor.y + 0.5);
  });

  it('wraps CJK by character', () => {
    const lines = wrapText('日本語の文章です', 40, 16);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('日本語の文章です');
  });
});
