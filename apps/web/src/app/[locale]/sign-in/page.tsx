'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/routing';
import { authMode, devToken, writeToken } from '@/lib/auth';
import { browserSupabase, hasSupabase } from '@/lib/supabase';

const schema = z.object({ email: z.string().email() });

export default function SignInPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<{ email: string }>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  return (
    <section className="mx-auto max-w-md rounded-3xl border border-line bg-card p-8">
      <h1 className="font-display text-4xl">{t('title')}</h1>
      <p className="mt-3 text-mist">{t('body')}</p>
      {authMode() === 'dev' || !hasSupabase() ? (
        <p className="mt-4 text-sm text-tide">{t('devHint')}</p>
      ) : null}
      <form
        className="mt-6 grid gap-3"
        onSubmit={form.handleSubmit(async (values) => {
          if (!hasSupabase()) {
            toast.error('Supabase is not configured.');
            return;
          }
          setPending(true);
          const { error } = await browserSupabase().auth.signInWithOtp({
            email: values.email,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          });
          setPending(false);
          if (error) toast.error(error.message);
          else toast.success(t('sent'));
        })}
      >
        <label className="text-sm" htmlFor="email">
          {t('email')}
        </label>
        <input
          id="email"
          type="email"
          className="h-11 rounded-2xl border border-line bg-paper px-3"
          {...form.register('email')}
        />
        {form.formState.errors.email ? (
          <p className="text-sm text-clay">{form.formState.errors.email.message}</p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {t('magic')}
        </Button>
      </form>
      <Button
        className="mt-3 w-full"
        variant="ghost"
        onClick={async () => {
          if (!hasSupabase()) {
            toast.error('Supabase is not configured.');
            return;
          }
          await browserSupabase().auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
          });
        }}
      >
        {t('google')}
      </Button>
      {authMode() === 'dev' ? (
        <Button
          className="mt-3 w-full"
          variant="clay"
          onClick={() => {
            writeToken(devToken());
            router.push('/dashboard');
          }}
        >
          {t('dev')}
        </Button>
      ) : null}
    </section>
  );
}
