'use client';

import { renderPageMarkup, type Job, type JobPage } from '@doctranslate/shared';
import { useQuery } from '@tanstack/react-query';
import { use, useEffect } from 'react';
import { api } from '@/lib/api';

type PageView = JobPage & { imageUrl: string | null };
type JobView = Omit<Job, 'pages'> & { pages: PageView[] };

export default function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { id } = use(params);
  const query = use(searchParams);
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api<JobView>(`/jobs/${id}`) });

  useEffect(() => {
    if (query.autoprint === '1' && job.data) {
      const timer = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [query.autoprint, job.data]);

  return (
    <div className="bg-white text-black">
      <style>{`
        @page { margin: 0; }
        .sheet { position: relative; overflow: hidden; break-after: page; background: white; }
        .sheet .page-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
        .sheet .block { position: absolute; margin: 0; overflow: hidden; white-space: pre-wrap; }
        @media screen {
          .sheet { margin: 0 auto 16px; box-shadow: 0 12px 40px rgba(0,0,0,.12); }
        }
      `}</style>
      {job.data?.pages.map((page) => (
        <div
          key={page.id}
          dangerouslySetInnerHTML={{
            __html: renderPageMarkup(page, {
              imageHref: page.imageUrl,
              title: `Page ${page.pageIndex + 1}`,
            }),
          }}
        />
      ))}
    </div>
  );
}
