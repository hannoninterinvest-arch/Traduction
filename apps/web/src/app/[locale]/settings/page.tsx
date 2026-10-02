'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { LanguageSelect } from '@/components/language-select';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const schema = z.object({ defaultTargetLang: z.string().min(2) });

export default function SettingsPage() {
  const t = useTranslations('settings');
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ preferences: { defaultTargetLang: string } }>('/me'),
  });
  const form = useForm<{ defaultTargetLang: string }>({
    resolver: zodResolver(schema),
    defaultValues: { defaultTargetLang: 'en' },
  });
  useEffect(() => {
    if (me.data) form.setValue('defaultTargetLang', me.data.preferences.defaultTargetLang);
  }, [me.data, form]);

  const save = useMutation({
    mutationFn: (values: { defaultTargetLang: string }) =>
      api('/me', { method: 'PATCH', body: JSON.stringify(values) }),
    onSuccess: () => toast.success(t('save')),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Error'),
  });
  const erase = useMutation({
    mutationFn: () => api('/me', { method: 'DELETE' }),
    onSuccess: () => toast.success(t('erased')),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Error'),
  });

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="font-display text-5xl">{t('title')}</h1>
      <form
        className="mt-6 grid gap-3"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <label htmlFor="default-target">{t('target')}</label>
        <LanguageSelect
          id="default-target"
          value={form.watch('defaultTargetLang')}
          onChange={(value) => form.setValue('defaultTargetLang', value)}
        />
        <Button type="submit">{t('save')}</Button>
      </form>
      <p className="mt-8 text-sm text-mist">{t('retention')}</p>
      <Button className="mt-4" variant="clay" onClick={() => erase.mutate()}>
        {t('erase')}
      </Button>
    </section>
  );
}
