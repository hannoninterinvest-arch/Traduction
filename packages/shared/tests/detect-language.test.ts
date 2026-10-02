import { detectLanguage } from '../src/detect-language';

describe('detectLanguage', () => {
  it('detects English, French, German, and Arabic', async () => {
    await expect(
      detectLanguage(
        'The tenant shall pay the monthly rent on the first day of each month without delay or deduction.',
      ),
    ).resolves.toBe('en');
    await expect(
      detectLanguage(
        'Le locataire doit payer le loyer mensuel le premier jour de chaque mois sans retard.',
      ),
    ).resolves.toBe('fr');
    await expect(
      detectLanguage(
        'Der Mieter zahlt die Miete am ersten Tag jedes Monats ohne Verzug und ohne Abzug.',
      ),
    ).resolves.toBe('de');
    await expect(
      detectLanguage(
        'يجب على المستأجر دفع الأجرة في اليوم الأول من كل شهر دون تأخير أو خصم من المبلغ.',
      ),
    ).resolves.toBe('ar');
  });
});
