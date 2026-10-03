import type { AuditEntry, AuditEntryInput } from './types';

export const GENESIS_HASH = '0'.repeat(64);

export type HashFn = (payload: string) => string;

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortValue(item));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(record[key]);
        return acc;
      }, {});
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function entryPayload(prevHash: string, entry: AuditEntryInput): string {
  return canonicalJson({
    action: entry.action,
    jobId: entry.jobId,
    metadata: entry.metadata ?? {},
    prevHash,
    timestamp: entry.timestamp,
    userId: entry.userId,
  });
}

export function appendAuditEntry(
  previous: Pick<AuditEntry, 'hash'> | null,
  input: AuditEntryInput,
  hashFn: HashFn,
): AuditEntry {
  const prevHash = previous?.hash ?? GENESIS_HASH;
  const hash = hashFn(entryPayload(prevHash, input));
  return {
    ...input,
    metadata: input.metadata ?? {},
    prevHash,
    hash,
  };
}

export function verifyAuditChain(
  entries: AuditEntry[],
  hashFn: HashFn,
): { ok: true } | { ok: false; brokenAt: number } {
  let expectedPrev = GENESIS_HASH;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) return { ok: false, brokenAt: index };
    if (entry.prevHash !== expectedPrev) return { ok: false, brokenAt: index };
    const recomputed = hashFn(entryPayload(entry.prevHash, entry));
    if (recomputed !== entry.hash) return { ok: false, brokenAt: index };
    expectedPrev = entry.hash;
  }
  return { ok: true };
}
