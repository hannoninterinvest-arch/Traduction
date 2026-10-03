export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  factor?: number;
  maxMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function retryDelayMs(
  attempt: number,
  baseMs: number,
  factor: number,
  maxMs: number,
): number {
  const raw = baseMs * factor ** Math.max(0, attempt - 1);
  const capped = Math.min(maxMs, raw);
  const jitter = capped * 0.15 * (attempt % 2 === 0 ? 1 : 0.5);
  return Math.round(capped + jitter);
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const baseMs = options.baseMs ?? 200;
  const factor = options.factor ?? 2;
  const maxMs = options.maxMs ?? 8_000;
  const sleep = options.sleep ?? defaultSleep;
  const shouldRetry = options.shouldRetry ?? (() => true);
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt > retries || !shouldRetry(error, attempt)) {
        throw error;
      }
      await sleep(retryDelayMs(attempt, baseMs, factor, maxMs));
    }
  }
  throw lastError;
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
