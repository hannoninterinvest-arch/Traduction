'use client';

import type { JobSummary } from '@doctranslate/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';

export default function HistoryPage() {
  const t = useTranslations();
  const client = useQueryClient();
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api<JobSummary[]>('/jobs') });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/jobs/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('errors.generic')),
  });

  return (
    <section>
      <h1 className="font-display text-5xl">{t('history.title')}</h1>
      {jobs.data?.length === 0 ? <p className="mt-6 text-mist">{t('history.empty')}</p> : null}
      <ul className="mt-6 grid gap-3">
        {jobs.data?.map((job) => (
          <li
            key={job.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-card px-5 py-4"
          >
            <div>
              <p className="font-medium">{job.originalFilename}</p>
              <p className="text-sm text-mist">
                {t(`status.${job.status}`)} · {job.targetLang} ·{' '}
                {new Date(job.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/jobs/${job.id}`}>{t('history.open')}</Link>
              </Button>
              <Button size="sm" variant="clay" onClick={() => remove.mutate(job.id)}>
                {t('history.delete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
