'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('errors');
  return (
    <div className="rounded-3xl border border-line bg-card p-8" role="alert">
      <h1 className="font-display text-3xl">{t('boundary')}</h1>
      <Button className="mt-6" onClick={reset}>
        {t('generic')}
      </Button>
    </div>
  );
}
