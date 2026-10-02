import { escapeHtml, inkForBackground, renderPageMarkup } from '../src/page-html';
import type { TextBlock } from '../src/types';

describe('page html', () => {
  it('escapes text and marks RTL blocks', () => {
    const block: TextBlock = {
      id: 'p0-b1',
      text: 'source',
      translatedText: '<script>عقد</script>',
      bbox: { x: 10, y: 20, w: 100, h: 40 },
      renderBBox: { x: 10, y: 20, w: 100, h: 48 },
      confidence: 1,
      rtl: true,
      direction: 'rtl',
      fontFamily: 'Noto Naskh Arabic',
      fontSize: 16,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#1a1814',
      backgroundColor: '#fffef8',
      align: 'right',
      lineIds: [],
    };
    const html = renderPageMarkup({ width: 200, height: 300, blocks: [block] });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(escapeHtml(`a&b`)).toBe('a&amp;b');
  });

  it('picks light ink on a dark sample', () => {
    expect(inkForBackground('#111111')).toBe('#f6f3ee');
    expect(inkForBackground('#f4f1ea')).toBe('#1a1814');
  });
});
