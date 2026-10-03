'use client';

import { Languages, Moon, Sun } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { readToken, writeToken } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { Button } from './ui/button';

const links = [
  ['/dashboard', 'nav.translate'],
  ['/history', 'nav.history'],
  ['/verify', 'nav.verify'],
  ['/settings', 'nav.settings'],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(readToken()));
  }, [pathname]);

  if (pathname.startsWith('/print')) {
    return <div className="print-root bg-white text-black">{children}</div>;
  }

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-5 md:grid-cols-[auto_1fr_auto]">
        <Link href="/" className="font-display text-2xl tracking-tight">
          {t('brand')}
        </Link>
        <nav
          className="col-span-2 row-start-2 flex flex-wrap items-center gap-1 md:col-span-1 md:col-start-2 md:row-start-1 md:justify-center"
          aria-label="Main"
        >
          {links.map(([href, key]) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'rounded-full px-3 py-2 text-sm text-mist hover:text-ink',
                pathname === href && 'bg-card text-ink shadow-sm',
              )}
            >
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 md:col-start-3">
          <label className="sr-only" htmlFor="locale">
            Language
          </label>
          <div className="flex items-center gap-1 rounded-full border border-line bg-card px-2">
            <Languages className="h-4 w-4 text-mist" aria-hidden />
            <select
              id="locale"
              className="bg-transparent py-2 text-sm"
              value={locale}
              onChange={(event) =>
                router.replace(pathname, { locale: event.target.value as 'en' | 'fr' | 'ar' })
              }
            >
              <option value="en">EN</option>
              <option value="fr">FR</option>
              <option value="ar">AR</option>
            </select>
          </div>
          <button
            type="button"
            className="rounded-full border border-line bg-card p-2"
            aria-label="Toggle color theme"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {signedIn ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                writeToken(null);
                setSignedIn(false);
                router.push('/');
              }}
            >
              {t('nav.signOut')}
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link href="/sign-in">{t('nav.signIn')}</Link>
            </Button>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 pb-16">
        {children}
      </main>
    </div>
  );
}
