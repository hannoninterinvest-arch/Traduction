'use client';

import { LANGUAGES } from '@doctranslate/shared';
import { useMemo, useState } from 'react';

export function LanguageSelect({
  id,
  value,
  onChange,
  includeAuto = false,
  autoLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  includeAuto?: boolean;
  autoLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return LANGUAGES.filter((language) => {
      if (!needle) return true;
      return (
        language.name.toLowerCase().includes(needle) ||
        language.nativeName.toLowerCase().includes(needle) ||
        language.code.toLowerCase().includes(needle)
      );
    });
  }, [query]);
  const selected = LANGUAGES.find((language) => language.code === value);

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-line bg-card px-3 text-start"
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          {value === 'auto'
            ? autoLabel
            : `${selected?.nativeName ?? value} · ${selected?.name ?? ''}`}
        </span>
      </button>
      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-line bg-card p-2 shadow-sheet">
          <input
            className="mb-2 h-10 w-full rounded-xl border border-line bg-paper px-3"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search languages"
          />
          <ul role="listbox" className="max-h-64 overflow-auto">
            {includeAuto ? (
              <li>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-start hover:bg-paper"
                  onClick={() => {
                    onChange('auto');
                    setOpen(false);
                  }}
                >
                  {autoLabel}
                </button>
              </li>
            ) : null}
            {options.map((language) => (
              <li key={language.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={language.code === value}
                  className="w-full rounded-xl px-3 py-2 text-start hover:bg-paper"
                  onClick={() => {
                    onChange(language.code);
                    setOpen(false);
                  }}
                >
                  {language.nativeName} <span className="text-mist">· {language.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
