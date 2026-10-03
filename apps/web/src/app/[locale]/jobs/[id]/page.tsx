'use client';

import type { Job, JobPage, TextBlock } from '@doctranslate/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TranslatedPage } from '@/components/translated-page';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/routing';
import { api } from '@/lib/api';

type PageView = JobPage & { imageUrl: string | null };
type JobView = Omit<Job, 'pages'> & { originalUrl: string | null; pages: PageView[] };

export default function JobPage({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id, locale } = use(params);
  const t = useTranslations();
  const router = useRouter();
  const [pageIndex, setPageIndex] = useState(0);
  const [waking, setWaking] = useState(false);
  const [selected, setSelected] = useState<TextBlock | null>(null);
  const [draft, setDraft] = useState('');
  const [fontSize, setFontSize] = useState(16);

  useEffect(() => {
    const timer = window.setTimeout(() => setWaking(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  const query = useQuery({
    queryKey: ['job', id],
    queryFn: () => api<JobView>(`/jobs/${id}`),
    refetchInterval: (current) => {
      const status = current.state.data?.status;
      return status === 'done' || status === 'failed' || status === 'cancelled' ? false : 2000;
    },
  });

  useEffect(() => {
    if (query.data) setWaking(false);
  }, [query.data]);

  const job = query.data;
  const page = job?.pages[pageIndex];

  async function saveBlock() {
    if (!job || !page || !selected) return;
    try {
      await api(`/jobs/${job.id}/pages/${page.id}/blocks/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ translatedText: draft, fontSize }),
      });
      toast.success(t('job.save'));
      setSelected(null);
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'));
    }
  }

  function downloadJson() {
    if (!job) return;
    const blob = new Blob([JSON.stringify(job.pages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${job.originalFilename}.blocks.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (query.isError) {
    return (
      <p role="alert">{query.error instanceof Error ? query.error.message : t('errors.generic')}</p>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-mist">{job?.originalFilename ?? '…'}</p>
          <h1 className="font-display text-4xl">{t(`status.${job?.status ?? 'queued'}`)}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push(`/print/${id}?autoprint=1`)}>
            {t('job.downloadPdf')}
          </Button>
          <Button variant="ghost" onClick={downloadJson} disabled={!job}>
            {t('job.downloadJson')}
          </Button>
        </div>
      </div>
      {waking && !job ? (
        <p className="mt-4 rounded-2xl bg-clay/10 px-4 py-3">{t('dashboard.waking')}</p>
      ) : null}
      <ol className="mt-6 flex flex-wrap gap-2" aria-label={t('job.status')}>
        {job?.pages.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="rounded-full border border-line bg-card px-3 py-1 text-sm"
              aria-current={item.pageIndex === pageIndex}
              onClick={() => setPageIndex(item.pageIndex)}
            >
              {item.pageIndex + 1} · {t(`status.${item.status}`)}
            </button>
          </li>
        ))}
      </ol>
      {job?.error ? <p className="mt-4 text-clay">{job.error}</p> : null}
      {page ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <figure>
            <figcaption className="mb-2 text-sm text-mist">{t('job.original')}</figcaption>
            {page.imageUrl ? (
              <img
                src={page.imageUrl}
                alt={t('job.original')}
                className="w-full rounded-sm shadow-sheet"
              />
            ) : (
              <div className="grid h-64 place-items-center rounded-3xl border border-line bg-card text-mist">
                {t('job.empty')}
              </div>
            )}
          </figure>
          <figure>
            <figcaption className="mb-2 text-sm text-mist">{t('job.translated')}</figcaption>
            <TranslatedPage
              width={page.width || 700}
              height={page.height || 900}
              imageUrl={page.imageUrl}
              blocks={page.blocks}
              selectedId={selected?.id}
              onSelect={(block) => {
                setSelected(block);
                setDraft(block.translatedText);
                setFontSize(block.fontSize);
              }}
            />
          </figure>
        </div>
      ) : null}
      {selected ? (
        <form
          className="mt-6 grid gap-3 rounded-3xl border border-line bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void saveBlock();
          }}
        >
          <h2 className="font-display text-2xl">{t('job.edit')}</h2>
          <label className="text-sm" htmlFor="draft">
            {t('job.translated')}
          </label>
          <textarea
            id="draft"
            className="min-h-28 rounded-2xl border border-line bg-paper p-3"
            dir={selected.direction}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <label className="text-sm" htmlFor="size">
            {t('job.fontSize')} ({fontSize})
          </label>
          <input
            id="size"
            type="range"
            min={8}
            max={48}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
          />
          <Button type="submit">{t('job.save')}</Button>
        </form>
      ) : null}
      <p className="sr-only">{locale}</p>
    </section>
  );
}
