import { retryDelayMs, withRetry } from '../src/retry';

describe('withRetry', () => {
  it('retries with exponential backoff and then succeeds', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error(`fail-${calls}`);
        return 'ok';
      },
      {
        retries: 4,
        baseMs: 100,
        factor: 2,
        maxMs: 10_000,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[1] ?? 0).toBeGreaterThan(sleeps[0] ?? 0);
  });

  it('throws after the retry budget is spent', async () => {
    await expect(
      withRetry(async () => Promise.reject(new Error('nope')), {
        retries: 2,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow('nope');
  });

  it('computes a capped delay', () => {
    const delay = retryDelayMs(8, 200, 2, 1000);
    expect(delay).toBeGreaterThan(1000);
    expect(delay).toBeLessThanOrEqual(1200);
  });
});
