import type { INestApplication } from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import request from 'supertest';
import { createApp } from '../src/main';
import { MetricsService } from '../src/metrics/metrics.service';

const USER = '00000000-0000-4000-8000-000000000001';
const AUTH = `Bearer dev:${USER}`;

async function samplePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Hello from DocTranslate', { x: 72, y: 720, size: 24, font });
  return Buffer.from(await pdf.save());
}

describe('job engine', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATA_DRIVER = 'memory';
    process.env.AUTH_MODE = 'dev';
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'false';
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects anonymous requests and reports health', async () => {
    await request(app.getHttpServer()).get('/jobs').expect(401);
    const health = await request(app.getHttpServer()).get('/health').expect(200);
    expect(health.body.status).toBe('ok');
    const wake = await request(app.getHttpServer()).get('/wake').expect(200);
    expect(wake.body.ok).toBe(true);
  });

  it('uploads, translates, and keeps per-page stages', async () => {
    const PDF = await samplePdf();
    const signed = await request(app.getHttpServer())
      .post('/uploads/sign')
      .set('Authorization', AUTH)
      .send({ filename: 'lease.pdf', contentType: 'application/pdf', size: PDF.length })
      .expect(201);
    expect(signed.body.mode).toBe('direct');

    await request(app.getHttpServer())
      .post('/uploads/direct')
      .set('Authorization', AUTH)
      .set('x-upload-path', signed.body.path)
      .set('x-upload-token', signed.body.token)
      .set('Content-Type', 'application/pdf')
      .send(PDF)
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', AUTH)
      .send({
        path: signed.body.path,
        filename: 'lease.pdf',
        contentType: 'application/pdf',
        size: PDF.length,
        targetLang: 'fr',
        sourceLang: 'en',
      })
      .expect(201);

    const jobId = created.body.id as string;
    const finished = await waitFor(async () => {
      const response = await request(app.getHttpServer())
        .get(`/jobs/${jobId}`)
        .set('Authorization', AUTH);
      if (response.body.status === 'done' || response.body.status === 'failed')
        return response.body;
      return null;
    });

    expect(finished.status).toBe('done');
    expect(finished.pages).toHaveLength(1);
    expect(finished.pages[0].status).toBe('done');
    expect(finished.pages[0].blocks.length).toBeGreaterThan(0);
    expect(finished.pages[0].blocks[0].translatedText).toContain('[fr]');
    expect(finished.pages[0].blocks[0].fontFamily).toBe('Noto Sans');
    expect(finished.originalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(finished.outputHash).toMatch(/^[a-f0-9]{64}$/);

    const stages = app
      .get(MetricsService)
      .recentStages()
      .map((stage) => stage.status);
    expect(stages).toEqual(expect.arrayContaining(['ocr', 'translating', 'rendering']));

    const block = finished.pages[0].blocks[0];
    const edited = await request(app.getHttpServer())
      .patch(`/jobs/${jobId}/pages/${finished.pages[0].id}/blocks/${block.id}`)
      .set('Authorization', AUTH)
      .send({ translatedText: 'Contrat de location' })
      .expect(200);
    expect(edited.body.translatedText).toBe('Contrat de location');

    const listed = await request(app.getHttpServer())
      .get('/jobs')
      .set('Authorization', AUTH)
      .expect(200);
    expect(listed.body.map((job: { id: string }) => job.id)).toContain(jobId);

    await request(app.getHttpServer())
      .delete(`/jobs/${jobId}`)
      .set('Authorization', AUTH)
      .expect(200);
    await request(app.getHttpServer()).get(`/jobs/${jobId}`).set('Authorization', AUTH).expect(404);
  });

  it('stores a default target language', async () => {
    const updated = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', AUTH)
      .send({ defaultTargetLang: 'de' })
      .expect(200);
    expect(updated.body.defaultTargetLang).toBe('de');
  });
});

async function waitFor<T>(read: () => Promise<T | null>, timeoutMs = 5000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('timed out waiting for the job');
}
