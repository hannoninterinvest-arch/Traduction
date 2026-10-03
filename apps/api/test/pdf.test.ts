import { PDFDocument, StandardFonts } from 'pdf-lib';
import { DocumentService } from '../src/pipeline/document.service';
import { AppConfig } from '../src/config/env';

describe('document pages', () => {
  it('extracts positioned text from a PDF and skips a blank image page count', async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_MODE = 'dev';
    process.env.PREPROCESS_IMAGES = 'false';
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([600, 800]);
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawText('Hello from DocTranslate', { x: 72, y: 720, size: 24, font });
    const bytes = Buffer.from(await pdf.save());
    const documents = new DocumentService(new AppConfig());
    expect(await documents.countPages(bytes, 'application/pdf')).toBe(1);
    const pages = [];
    for await (const prepared of documents.eachPage(bytes, 'application/pdf')) pages.push(prepared);
    expect(pages).toHaveLength(1);
    const text = pages[0]?.tokens?.map((token) => token.text).join(' ');
    expect(text).toContain('Hello');
    expect(text).toContain('DocTranslate');
    expect(pages[0]?.width).toBeGreaterThan(100);
    const image = pages[0]?.image;
    expect(image?.subarray(0, 4).toString('hex')).toBe('89504e47');
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(image ?? Buffer.alloc(0))
      .raw()
      .toBuffer({ resolveWithObject: true });
    let dark = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if ((data[i] ?? 255) < 250) dark += 1;
    }
    expect(dark).toBeGreaterThan(50);
    expect(pages[0]?.tokens?.[0]?.bbox.w).toBeGreaterThan(1);
    const token = pages[0]?.tokens?.[0];
    expect(token && token.bbox.y).toBeLessThan((pages[0]?.height ?? 1) * 0.35);
  });
});
