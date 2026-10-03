import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/noto-naskh-arabic/400.css';
import '@fontsource/noto-sans-hebrew/400.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-thai/400.css';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Providers } from '@/components/providers';
import { Shell } from '@/components/shell';
import { routing } from '@/i18n/routing';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as 'en' | 'fr' | 'ar')) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP&family=Noto+Sans+KR&family=Noto+Sans+SC&family=Noto+Sans+TC&display=swap"
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <Shell>{children}</Shell>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
