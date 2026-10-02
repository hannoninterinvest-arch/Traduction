'use client';

import type { CreateJobInput, SignedUpload, SupportedMime } from '@doctranslate/shared';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { LanguageSelect } from '@/components/language-select';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/routing';
import { ApiError, api, apiUrl, uploadWithProgress } from '@/lib/api';
import { readToken } from '@/lib/auth';
import { browserSupabase, hasSupabase } from '@/lib/supabase';

const MIME: Record<string, SupportedMime> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [targetLang, setTargetLang] = useState('fr');
  const [sourceLang, setSourceLang] = useState('auto');
  const [progress, setProgress] = useState<number | null>(null);
  const [waking, setWaking] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  const drop = useDropzone({
    multiple: false,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    onDrop: (files) => setFile(files[0] ?? null),
  });

  async function translate() {
    if (!readToken()) {
      router.push('/sign-in');
      return;
    }
    if (!file) return;
    const contentType = MIME[file.type];
    if (!contentType) {
      toast.error('Upload a PDF, JPG, PNG, or WEBP file.');
      return;
    }
    const wakeTimer = window.setTimeout(() => setWaking(true), 4000);
    try {
      const signed = await api<SignedUpload>('/uploads/sign', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentType, size: file.size }),
      });
      setProgress(0);
      if (signed.mode === 'supabase' && signed.token && hasSupabase()) {
        const { error } = await browserSupabase()
          .storage.from(signed.bucket)
          .uploadToSignedUrl(signed.path, signed.token, file);
        if (error) throw new ApiError(error.message, 400);
        setProgress(1);
      } else {
        const token = readToken() ?? '';
        const upload = uploadWithProgress(
          `${apiUrl()}/uploads/direct`,
          file,
          {
            authorization: `Bearer ${token}`,
            'x-upload-path': signed.path,
            'x-upload-token': signed.token,
            'content-type': file.type,
          },
          setProgress,
        );
        abortRef.current = upload.abort;
        await upload.promise;
      }
      const job = await api<{ id: string }>('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          path: signed.path,
          filename: file.name,
          contentType,
          size: file.size,
          targetLang,
          sourceLang,
        } satisfies CreateJobInput),
      });
      router.push(`/jobs/${job.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CANCELLED') return;
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      window.clearTimeout(wakeTimer);
      setWaking(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-display text-5xl">{t('title')}</h1>
      <div
        {...drop.getRootProps()}
        className="mt-6 cursor-pointer rounded-3xl border border-dashed border-line bg-card px-6 py-16 text-center"
      >
        <input {...drop.getInputProps()} aria-label={t('drop')} />
        <p className="text-lg">{file ? file.name : t('drop')}</p>
        <p className="mt-2 text-sm text-mist">{t('hint')}</p>
      </div>
      {progress !== null ? (
        <div className="mt-4" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-tide" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span>
              {t('uploading')} {Math.round(progress * 100)}%
            </span>
            <button type="button" className="text-clay" onClick={() => abortRef.current?.()}>
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : null}
      {waking ? (
        <p className="mt-4 rounded-2xl bg-clay/10 px-4 py-3 text-sm">{t('waking')}</p>
      ) : null}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm" htmlFor="target">
            {t('target')}
          </label>
          <LanguageSelect id="target" value={targetLang} onChange={setTargetLang} />
        </div>
        <div>
          <label className="mb-2 block text-sm" htmlFor="source">
            {t('source')}
          </label>
          <LanguageSelect
            id="source"
            value={sourceLang}
            onChange={setSourceLang}
            includeAuto
            autoLabel={t('auto')}
          />
        </div>
      </div>
      <Button
        className="mt-6"
        disabled={!file || progress !== null}
        onClick={() => void translate()}
      >
        {t('submit')}
      </Button>
    </section>
  );
}
