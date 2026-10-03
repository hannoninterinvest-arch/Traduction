'use client';

import type { TextBlock } from '@doctranslate/shared';

export function TranslatedPage({
  width,
  height,
  imageUrl,
  blocks,
  selectedId,
  onSelect,
}: {
  width: number;
  height: number;
  imageUrl: string | null;
  blocks: TextBlock[];
  selectedId?: string | null;
  onSelect?: (block: TextBlock) => void;
}) {
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-sm bg-white shadow-sheet"
      style={{
        width: '100%',
        maxWidth: width,
        aspectRatio: `${width} / ${height}`,
        containerType: 'size',
      }}
    >
      <div className="relative h-full w-full">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-fill" />
        ) : (
          <div className="absolute inset-0 bg-[#fffdf8]" />
        )}
        {blocks.map((block) => {
          const box = block.renderBBox ?? block.bbox;
          const padX = (4 / width) * 100;
          const padY = (3 / height) * 100;
          return (
            <button
              key={block.id}
              type="button"
              className="sheet-font absolute overflow-hidden border border-transparent text-start hover:border-tide"
              dir={block.direction}
              lang={block.direction === 'rtl' ? 'ar' : undefined}
              style={{
                left: `${(box.x / width) * 100 - padX}%`,
                top: `${(box.y / height) * 100 - padY}%`,
                width: `${(box.w / width) * 100 + padX * 2}%`,
                minHeight: `${(box.h / height) * 100 + padY * 2}%`,
                padding: '1px 3px',
                fontFamily: `'${block.fontFamily}', 'Noto Sans', sans-serif`,
                fontSize: `${(block.fontSize / width) * 100}cqw`,
                fontWeight: block.fontWeight,
                fontStyle: block.fontStyle,
                lineHeight: 1.25,
                color: block.color,
                background: block.backgroundColor,
                textAlign: block.align,
                outline: selectedId === block.id ? '2px solid var(--clay)' : undefined,
              }}
              onClick={() => onSelect?.(block)}
            >
              {block.translatedText || block.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
