import { AnchorService } from '../src/integrity/anchor.service';
import { AppConfig } from '../src/config/env';

describe('anchor', () => {
  it('does not touch a network when anchoring is off', async () => {
    process.env.ANCHOR_ENABLED = 'false';
    process.env.NODE_ENV = 'test';
    process.env.AUTH_MODE = 'dev';
    const result = await new AnchorService(new AppConfig()).anchor('ab'.repeat(32));
    expect(result.anchored).toBe(false);
    expect(result.txHash).toBeNull();
  });
});
