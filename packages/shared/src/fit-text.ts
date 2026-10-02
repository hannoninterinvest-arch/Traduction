import type { BBox } from './types.js';
import { charWidthRatio, widthClass } from './script.js';

export interface FitTextInput {
  text: string;
  bbox: BBox;
  neighbors?: BBox[];
  pageHeight?: number;
  maxFontSize?: number;
  minFontSize?: number;
  lineHeightRatio?: number;
  padding?: number;
  maxGrow?: number;
}

export interface FitTextResult {
  fontSize: number;
  lines: string[];
  lineHeight: number;
  extraHeight: number;
  renderBBox: BBox;
}

export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const ratio = charWidthRatio(text);
  const charWidth = Math.max(1, fontSize * ratio);
  const capacity = Math.max(1, Math.floor(maxWidth / charWidth));
  const script = widthClass(text);
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (script === 'cjk') {
    const lines: string[] = [];
    for (let index = 0; index < normalized.length; index += capacity) {
      lines.push(normalized.slice(index, index + capacity));
    }
    return lines;
  }
  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= capacity) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (word.length > capacity) {
      for (let index = 0; index < word.length; index += capacity) {
        const slice = word.slice(index, index + capacity);
        if (index + capacity >= word.length) current = slice;
        else lines.push(slice);
      }
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function overlapsX(a: BBox, b: BBox): boolean {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > Math.min(a.w, b.w) * 0.15;
}

export function freeSpaceBelow(bbox: BBox, neighbors: BBox[], pageHeight: number): number {
  let limit = pageHeight;
  for (const neighbor of neighbors) {
    const below = neighbor.y >= bbox.y + bbox.h - 2;
    if (below && overlapsX(bbox, neighbor)) {
      limit = Math.min(limit, neighbor.y);
    }
  }
  return Math.max(0, limit - (bbox.y + bbox.h));
}

function fits(
  lines: string[],
  fontSize: number,
  lineHeightRatio: number,
  availableHeight: number,
): boolean {
  return lines.length * fontSize * lineHeightRatio <= availableHeight + 0.5;
}

export function shrinkToFit(input: FitTextInput): FitTextResult {
  const padding = input.padding ?? 2;
  const lineHeightRatio = input.lineHeightRatio ?? 1.25;
  const minFontSize = input.minFontSize ?? 7;
  const estimated = Math.min(input.maxFontSize ?? 48, Math.max(minFontSize, input.bbox.h * 0.78));
  const innerWidth = Math.max(8, input.bbox.w - padding * 2);
  const innerHeight = Math.max(8, input.bbox.h - padding * 2);
  const neighbors = input.neighbors ?? [];
  const pageHeight = input.pageHeight ?? input.bbox.y + input.bbox.h + (input.maxGrow ?? 80);
  const availableGrow = Math.min(
    input.maxGrow ?? 72,
    freeSpaceBelow(input.bbox, neighbors, pageHeight),
  );

  let low = minFontSize;
  let high = estimated;
  let best = minFontSize;
  for (let step = 0; step < 18; step += 1) {
    const mid = (low + high) / 2;
    const lines = wrapText(input.text, innerWidth, mid);
    if (fits(lines, mid, lineHeightRatio, innerHeight)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  let lines = wrapText(input.text, innerWidth, best);
  let extraHeight = 0;
  const needed = lines.length * best * lineHeightRatio;
  if (needed > innerHeight + 0.5) {
    extraHeight = Math.min(availableGrow, Math.ceil(needed - innerHeight));
    if (extraHeight < needed - innerHeight) {
      let shrinkLow = minFontSize;
      let shrinkHigh = best;
      best = minFontSize;
      for (let step = 0; step < 18; step += 1) {
        const mid = (shrinkLow + shrinkHigh) / 2;
        const candidate = wrapText(input.text, innerWidth, mid);
        if (fits(candidate, mid, lineHeightRatio, innerHeight + extraHeight)) {
          best = mid;
          shrinkLow = mid;
        } else {
          shrinkHigh = mid;
        }
      }
      lines = wrapText(input.text, innerWidth, best);
      const grownNeeded = lines.length * best * lineHeightRatio;
      extraHeight = Math.min(availableGrow, Math.max(0, Math.ceil(grownNeeded - innerHeight)));
    }
  }

  const fontSize = Math.round(best * 10) / 10;
  return {
    fontSize,
    lines,
    lineHeight: Math.round(fontSize * lineHeightRatio * 10) / 10,
    extraHeight,
    renderBBox: {
      x: input.bbox.x,
      y: input.bbox.y,
      w: input.bbox.w,
      h: input.bbox.h + extraHeight,
    },
  };
}
