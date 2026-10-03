import { renderPageMarkup, type JobPage } from '@doctranslate/shared';
import { AppException } from '../common/app.exception';

export function documentHtml(pages: JobPage[], imageHrefs: Array<string | null>): string {
  const sheets = pages
    .map((page, index) =>
      renderPageMarkup(page, {
        imageHref: imageHrefs[index] ?? null,
        title: `Page ${page.pageIndex + 1}`,
      }),
    )
    .join('');
  const first = pages[0];
  const width = first ? `${(first.width / 96).toFixed(2)}in` : '8.5in';
  const height = first ? `${(first.height / 96).toFixed(2)}in` : '11in';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${width} ${height}; margin: 0; }
    html, body { margin: 0; background: white; }
    .sheet { position: relative; overflow: hidden; break-after: page; }
    .page-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
    .block { position: absolute; margin: 0; padding: 1px 2px; box-sizing: border-box; white-space: pre-wrap; overflow: hidden; }
  </style></head><body>${sheets}</body></html>`;
}

export async function renderServerPdf(html: string): Promise<Buffer> {
  try {
    const chromium = (await import('@sparticuz/chromium')) as {
      default?: { args: string[]; executablePath: () => Promise<string> };
      args: string[];
      executablePath: () => Promise<string>;
    };
    const puppeteer = (await import('puppeteer-core')) as {
      launch: (opts: { args: string[]; executablePath: string; headless: boolean }) => Promise<{
        newPage: () => Promise<{
          setContent: (html: string, opts: { waitUntil: string }) => Promise<void>;
          pdf: (opts: object) => Promise<Uint8Array>;
          close: () => Promise<void>;
        }>;
        close: () => Promise<void>;
      }>;
    };
    const pack = chromium.default ?? chromium;
    const browser = await puppeteer.launch({
      args: pack.args,
      executablePath: await pack.executablePath(),
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  } catch {
    throw new AppException(
      'PROVIDER_FAILURE',
      'Server PDF rendering is unavailable on this host. Download from the browser instead.',
      501,
    );
  }
}
