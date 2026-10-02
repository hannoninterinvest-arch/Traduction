import type { BBox, TextBlock } from '@doctranslate/shared';
import { inkForBackground } from '@doctranslate/shared';

export async function paintBackgrounds(png: Buffer, blocks: TextBlock[]): Promise<TextBlock[]> {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return blocks.map((block) => {
    const backgroundColor = medianRing(data, info.width, info.height, info.channels, block.bbox);
    return { ...block, backgroundColor, color: inkForBackground(backgroundColor) };
  });
}

function medianRing(
  pixels: Buffer,
  width: number,
  height: number,
  channels: number,
  bbox: BBox,
): string {
  const samples: number[][] = [];
  const x0 = Math.max(0, Math.floor(bbox.x) - 4);
  const y0 = Math.max(0, Math.floor(bbox.y) - 4);
  const x1 = Math.min(width - 1, Math.ceil(bbox.x + bbox.w) + 4);
  const y1 = Math.min(height - 1, Math.ceil(bbox.y + bbox.h) + 4);
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const inside = x >= bbox.x && x <= bbox.x + bbox.w && y >= bbox.y && y <= bbox.y + bbox.h;
      if (inside) continue;
      const offset = (y * width + x) * channels;
      samples.push([pixels[offset] ?? 255, pixels[offset + 1] ?? 255, pixels[offset + 2] ?? 255]);
    }
  }
  if (samples.length === 0) return '#ffffff';
  const channel = (index: number) => {
    const values = samples.map((sample) => sample[index] ?? 255).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 255;
  };
  return `#${[0, 1, 2].map((index) => channel(index).toString(16).padStart(2, '0')).join('')}`;
}
