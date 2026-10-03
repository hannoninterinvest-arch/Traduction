import { detectMime, findDangerousPdfFeatures } from '../src/mime';

describe('detectMime', () => {
  it('recognizes PDF, PNG, JPEG, and WEBP magic bytes', () => {
    expect(detectMime(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe(
      'application/pdf',
    );
    expect(detectMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(detectMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(detectMime(webp)).toBe('image/webp');
    expect(detectMime(Uint8Array.from([0x00, 0x01, 0x02]))).toBeNull();
  });

  it('flags active PDF features', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\n/JavaScript (alert)\n/Launch');
    expect(findDangerousPdfFeatures(bytes)).toEqual(
      expect.arrayContaining(['/JavaScript', '/Launch']),
    );
  });
});
