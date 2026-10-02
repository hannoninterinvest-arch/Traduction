import sharp from 'sharp';
import { paintBackgrounds } from '../src/pipeline/background';
import type { TextBlock } from '@doctranslate/shared';

describe('background sampling', () => {
  it('covers a block with the surrounding median color', async () => {
    const png = await sharp({
      create: { width: 30, height: 30, channels: 3, background: { r: 20, g: 40, b: 180 } },
    })
      .png()
      .toBuffer();
    const block = {
      id: 'b',
      text: 'Hi',
      translatedText: 'Hi',
      bbox: { x: 8, y: 8, w: 10, h: 10 },
      renderBBox: { x: 8, y: 8, w: 10, h: 10 },
      confidence: 1,
      rtl: false,
      direction: 'ltr' as const,
      fontFamily: 'Noto Sans',
      fontSize: 12,
      fontWeight: 'normal' as const,
      fontStyle: 'normal' as const,
      color: '#111111',
      backgroundColor: '#ffffff',
      align: 'left' as const,
      lineIds: [],
    } satisfies TextBlock;
    const [painted] = await paintBackgrounds(png, [block]);
    expect(painted?.backgroundColor.startsWith('#')).toBe(true);
    expect(painted?.color).toBe('#f6f3ee');
  });
});