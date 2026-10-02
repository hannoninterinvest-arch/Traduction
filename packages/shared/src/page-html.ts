import type { JobPage, TextBlock } from './types';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderPageMarkup(
  page: Pick<JobPage, 'width' | 'height' | 'blocks'>,
  options?: { imageHref?: string | null; title?: string },
): string {
  const blocks = page.blocks
    .map((block) => blockMarkup(block))
    .join('');
  const image = options?.imageHref
    ? `<img class="page-bg" alt="" src="${escapeHtml(options.imageHref)}" />`
    : '';
  return `<section class="sheet" style="width:${page.width}px;height:${page.height}px" aria-label="${escapeHtml(options?.title ?? 'Translated page')}">${image}${blocks}</section>`;
}

function blockMarkup(block: TextBlock): string {
  const box = block.renderBBox ?? block.bbox;
  const style = [
    `left:${box.x}px`,
    `top:${box.y}px`,
    `width:${box.w}px`,
    `min-height:${box.h}px`,
    `font-size:${block.fontSize}px`,
    `line-height:1.25`,
    `font-family:${escapeHtml(block.fontFamily)}, 'Noto Sans', sans-serif`,
    `font-weight:${block.fontWeight}`,
    `font-style:${block.fontStyle}`,
    `color:${escapeHtml(block.color)}`,
    `background:${escapeHtml(block.backgroundColor)}`,
    `text-align:${block.align}`,
  ].join(';');
  return `<p class="block" dir="${block.direction}" lang="${escapeHtml(block.direction === 'rtl' ? 'ar' : 'en')}" style="${style}">${escapeHtml(block.translatedText || block.text)}</p>`;
}

export function inkForBackground(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length < 6) return '#1a1814';
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.45 ? '#f6f3ee' : '#1a1814';
}
