import { expect, test } from '@playwright/test';

const jobId = '11111111-1111-4111-8111-111111111111';

test('landing page lists the three steps in English and flips to Arabic', async ({ page }) => {
  await page.goto('/en');
  await expect(page.getByRole('heading', { name: 'The page stays. The language changes.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upload' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Export' })).toBeVisible();
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('a signed-in user can translate a file against a mocked API', async ({ page }) => {
  await page.route('http://localhost:3001/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.endsWith('/uploads/sign') && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'direct',
          path: '00000000-0000-4000-8000-000000000001/demo/original.pdf',
          token: 'demo-token',
          signedUrl: null,
          uploadUrl: 'http://localhost:3001/uploads/direct',
          bucket: 'documents',
        }),
      });
      return;
    }
    if (url.endsWith('/uploads/direct') && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ path: 'demo', size: 12, contentType: 'application/pdf' }),
      });
      return;
    }
    if (url.endsWith('/jobs') && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: jobId }),
      });
      return;
    }
    if (url.includes(`/jobs/${jobId}`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: jobId,
          status: 'done',
          originalFilename: 'note.pdf',
          targetLang: 'fr',
          sourceLang: 'en',
          detectedLang: 'en',
          error: null,
          originalUrl: null,
          pages: [
            {
              id: 'page-1',
              pageIndex: 0,
              status: 'done',
              width: 400,
              height: 520,
              imageUrl: null,
              error: null,
              blocks: [
                {
                  id: 'block-1',
                  text: 'Hello',
                  translatedText: '[fr] Hello',
                  bbox: { x: 20, y: 30, w: 180, h: 28 },
                  renderBBox: { x: 20, y: 30, w: 180, h: 28 },
                  confidence: 1,
                  rtl: false,
                  direction: 'ltr',
                  fontFamily: 'Noto Sans',
                  fontSize: 16,
                  fontWeight: 'normal',
                  fontStyle: 'normal',
                  color: '#1a1814',
                  backgroundColor: '#ffffff',
                  align: 'left',
                  lineIds: ['l1'],
                },
              ],
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: 'Continue in local demo' }).click();
  await expect(page.getByRole('heading', { name: 'New translation' })).toBeVisible();
  await page.getByLabel('Drop a scan here, or browse').setInputFiles({
    name: 'note.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n'),
  });
  await page.getByRole('button', { name: 'Translate' }).click();
  await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible();
  await expect(page.getByRole('button', { name: '[fr] Hello' })).toBeVisible();
});
