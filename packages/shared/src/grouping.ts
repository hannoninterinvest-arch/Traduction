import type { BBox, OcrToken, TextBlock } from './types.js';
import { fontForLanguage } from './fonts.js';
import { isRtlText, joinsWithoutSpace } from './script.js';

export interface GroupingOptions {
  pageIndex?: number;
  lineOverlap?: number;
  paragraphGapRatio?: number;
  cellGapRatio?: number;
  sourceLang?: string;
}

function unionBox(boxes: BBox[]): BBox {
  const first = boxes[0];
  if (!first) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.w;
  let maxY = first.y + first.h;
  for (const box of boxes.slice(1)) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

function verticalOverlap(a: BBox, b: BBox): number {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, bottom - top);
}

function horizontalOverlap(a: BBox, b: BBox): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  return Math.max(0, right - left);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (sorted.length % 2 === 0 && left !== undefined && right !== undefined)
    return (left + right) / 2;
  return right ?? 0;
}

interface LineToken extends OcrToken {
  rtl: boolean;
}

interface Segment {
  tokens: LineToken[];
  bbox: BBox;
  text: string;
  confidence: number;
  rtl: boolean;
  lineIds: string[];
  tabular: boolean;
}

function joinTokens(tokens: LineToken[], rtl: boolean): string {
  const ordered = [...tokens].sort((a, b) => (rtl ? b.bbox.x - a.bbox.x : a.bbox.x - b.bbox.x));
  let text = '';
  for (const token of ordered) {
    const piece = token.text.trim();
    if (!piece) continue;
    if (!text) {
      text = piece;
      continue;
    }
    const previous = text.slice(-1);
    text += joinsWithoutSpace(previous, piece[0] ?? '') ? piece : ` ${piece}`;
  }
  return text;
}

function tokensToSegment(tokens: LineToken[], tabular: boolean): Segment {
  const text = tokens.map((token) => token.text).join(' ');
  const rtl = isRtlText(text) || tokens.filter((token) => token.rtl).length > tokens.length / 2;
  const joined = joinTokens(tokens, rtl);
  const confidence =
    tokens.reduce((sum, token) => sum + token.confidence, 0) / Math.max(1, tokens.length);
  return {
    tokens,
    bbox: unionBox(tokens.map((token) => token.bbox)),
    text: joined,
    confidence,
    rtl,
    tabular,
    lineIds: [
      ...new Set(tokens.map((token) => token.lineId).filter((id): id is string => Boolean(id))),
    ],
  };
}

function clusterLines(tokens: LineToken[], lineOverlap: number): LineToken[][] {
  const sorted = [...tokens].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const lines: LineToken[][] = [];
  for (const token of sorted) {
    let placed = false;
    for (const line of lines) {
      const box = unionBox(line.map((item) => item.bbox));
      const overlap = verticalOverlap(box, token.bbox);
      const minH = Math.min(box.h, token.bbox.h);
      const centerDelta = Math.abs(box.y + box.h / 2 - (token.bbox.y + token.bbox.h / 2));
      if (overlap >= minH * lineOverlap || centerDelta <= minH * 0.45) {
        line.push(token);
        placed = true;
        break;
      }
    }
    if (!placed) lines.push([token]);
  }
  return lines;
}

function typicalCharWidth(tokens: LineToken[]): number {
  const stable = tokens.filter((token) => token.text.trim().length >= 3);
  const source = stable.length > 0 ? stable : tokens;
  const widths = source.map((token) => token.bbox.w / Math.max(1, token.text.trim().length));
  return Math.max(4, median(widths));
}

function splitCells(
  line: LineToken[],
  cellGapRatio: number,
): Array<{ tokens: LineToken[]; tabular: boolean }> {
  const ordered = [...line].sort((a, b) => a.bbox.x - b.bbox.x);
  if (ordered.length <= 1) return [{ tokens: ordered, tabular: false }];
  const threshold = typicalCharWidth(ordered) * cellGapRatio;
  const cells: LineToken[][] = [];
  let current: LineToken[] = [];
  ordered.forEach((token, index) => {
    if (index === 0) {
      current = [token];
      return;
    }
    const prev = ordered[index - 1];
    const gap = prev ? token.bbox.x - (prev.bbox.x + prev.bbox.w) : 0;
    if (gap > threshold) {
      cells.push(current);
      current = [token];
      return;
    }
    current.push(token);
  });
  if (current.length) cells.push(current);
  const tabular = cells.length > 1;
  return cells.map((tokens) => ({ tokens, tabular }));
}

function sameColumn(a: BBox, b: BBox): boolean {
  const overlap = horizontalOverlap(a, b);
  const minW = Math.min(a.w, b.w);
  const leftDelta = Math.abs(a.x - b.x);
  return overlap >= minW * 0.45 || leftDelta <= Math.max(12, minW * 0.35);
}

function toBlock(segment: Segment, id: string, sourceLang?: string): TextBlock {
  const lang = sourceLang && sourceLang !== 'auto' ? sourceLang : segment.rtl ? 'ar' : 'en';
  const font = fontForLanguage(segment.rtl ? 'ar' : lang);
  const direction = segment.rtl ? 'rtl' : 'ltr';
  return {
    id,
    text: segment.text,
    translatedText: segment.text,
    bbox: segment.bbox,
    renderBBox: { ...segment.bbox },
    confidence: Number(segment.confidence.toFixed(4)),
    rtl: segment.rtl,
    direction,
    fontFamily: font.family,
    fontSize: Math.max(8, Math.round(segment.bbox.h * 0.72)),
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: '#1a1814',
    backgroundColor: '#ffffff',
    align: direction === 'rtl' ? 'right' : 'left',
    lineIds: segment.lineIds,
    ...(sourceLang ? { sourceLang } : {}),
  };
}

export function groupTokensIntoBlocks(
  tokens: OcrToken[],
  options: GroupingOptions = {},
): TextBlock[] {
  const usable = tokens.filter((token) => token.text.trim().length > 0);
  if (usable.length === 0) return [];
  const lineOverlap = options.lineOverlap ?? 0.45;
  const paragraphGapRatio = options.paragraphGapRatio ?? 0.85;
  const cellGapRatio = options.cellGapRatio ?? 2.3;
  const prepared: LineToken[] = usable.map((token) => ({
    ...token,
    rtl: token.rtl ?? isRtlText(token.text),
  }));
  const lines = clusterLines(prepared, lineOverlap);
  const segments = lines.flatMap((line) =>
    splitCells(line, cellGapRatio).map((cell) => tokensToSegment(cell.tokens, cell.tabular)),
  );
  segments.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);

  const heights = segments.map((segment) => segment.bbox.h);
  const typicalHeight = Math.max(8, median(heights));
  const merged: Segment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(segment);
      continue;
    }
    const gap = segment.bbox.y - (previous.bbox.y + previous.bbox.h);
    const canMerge =
      !previous.tabular &&
      !segment.tabular &&
      previous.rtl === segment.rtl &&
      gap >= -typicalHeight * 0.2 &&
      gap <= typicalHeight * paragraphGapRatio &&
      sameColumn(previous.bbox, segment.bbox);
    if (!canMerge) {
      merged.push(segment);
      continue;
    }
    const joiner = previous.rtl || segment.rtl ? ' ' : ' ';
    previous.text = `${previous.text}${joiner}${segment.text}`.replace(/\s+/g, ' ').trim();
    previous.bbox = unionBox([previous.bbox, segment.bbox]);
    previous.confidence = (previous.confidence + segment.confidence) / 2;
    previous.tokens = previous.tokens.concat(segment.tokens);
    previous.lineIds = [...new Set([...previous.lineIds, ...segment.lineIds])];
  }

  const pageIndex = options.pageIndex ?? 0;
  return merged.map((segment, index) =>
    toBlock(segment, `p${pageIndex}-b${index + 1}`, options.sourceLang),
  );
}
