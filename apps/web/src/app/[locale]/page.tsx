import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('landing');
  const steps = t.raw('steps') as Array<{ title: string; body: string }>;
  return (
    <section className="grid gap-12 py-8 md:grid-cols-[1.2fr_0.8fr] md:items-end">
      <div>
        <p className="text-sm uppercase tracking-[0.22em] text-tide">{t('kicker')}</p>
        <h1 className="mt-4 max-w-xl font-display text-5xl leading-[1.05] md:text-7xl">
          {t('title')}
        </h1>
        <p className="mt-6 max-w-xl text-lg text-mist">{t('body')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard">{t('cta')}</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/verify">{t('secondary')}</Link>
          </Button>
        </div>
      </div>
      <ol className="grid gap-3">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-3xl border border-line bg-card p-5">
            <p className="text-sm text-clay">0{index + 1}</p>
            <h2 className="mt-1 font-display text-2xl">{step.title}</h2>
            <p className="mt-2 text-mist">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
