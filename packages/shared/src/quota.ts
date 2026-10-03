export class QuotaExceededError extends Error {
  readonly code = 'QUOTA_EXCEEDED' as const;
  constructor(used: number, incoming: number, quota: number) {
    super(`Monthly page quota exceeded (${used} used, ${incoming} requested, limit ${quota}).`);
    this.name = 'QuotaExceededError';
  }
}

export function assertPageQuota(usedPages: number, incomingPages: number, quota: number): void {
  if (quota <= 0) return;
  if (usedPages + incomingPages > quota) {
    throw new QuotaExceededError(usedPages, incomingPages, quota);
  }
}
