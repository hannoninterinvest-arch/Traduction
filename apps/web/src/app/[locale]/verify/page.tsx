'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, sha256File } from '@/lib/api';

export default function VerifyPage() {
  const t = useTranslations('verify');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="font-display text-5xl">{t('title')}</h1>
      <p className="mt-3 text-mist">{t('body')}</p>
      <input
        className="mt-6 block w-full"
        type="file"
        aria-label={t('title')}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <Button
        className="mt-4"
        disabled={!file}
        onClick={() => {
          if (!file) return;
          void sha256File(file)
            .then((hash) =>
              api<{ match: boolean }>('/verify', {
                method: 'POST',
                body: JSON.stringify({ hash }),
              }),
            )
            .then((body) => setResult(body.match ? t('match') : t('miss')))
            .catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : 'Error'),
            );
        }}
      >
        {t('check')}
      </Button>
      {result ? (
        <p className="mt-4" role="status">
          {result}
        </p>
      ) : null}
    </section>
  );
}
