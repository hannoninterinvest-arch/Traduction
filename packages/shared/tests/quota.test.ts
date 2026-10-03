import { assertPageQuota, QuotaExceededError } from '../src/quota';

describe('assertPageQuota', () => {
  it('allows usage inside the quota and rejects the rest', () => {
    expect(() => assertPageQuota(10, 5, 20)).not.toThrow();
    expect(() => assertPageQuota(18, 5, 20)).toThrow(QuotaExceededError);
    expect(() => assertPageQuota(100, 10, 0)).not.toThrow();
  });
});
