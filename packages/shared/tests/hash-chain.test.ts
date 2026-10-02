import { createHash } from 'node:crypto';
import { appendAuditEntry, verifyAuditChain } from '../src/hash-chain';

const sha256 = (payload: string) => createHash('sha256').update(payload).digest('hex');

describe('audit hash chain', () => {
  it('links each entry to the previous hash and detects tampering', () => {
    const first = appendAuditEntry(
      null,
      {
        jobId: 'job-1',
        userId: 'user-1',
        action: 'job.created',
        timestamp: '2026-10-02T12:00:00.000Z',
        metadata: { pages: 2 },
      },
      sha256,
    );
    const second = appendAuditEntry(
      first,
      {
        jobId: 'job-1',
        userId: 'user-1',
        action: 'job.completed',
        timestamp: '2026-10-02T12:05:00.000Z',
      },
      sha256,
    );
    expect(second.prevHash).toBe(first.hash);
    expect(verifyAuditChain([first, second], sha256)).toEqual({ ok: true });

    const tampered = { ...second, metadata: { pages: 9 } };
    const result = verifyAuditChain([first, tampered], sha256);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.brokenAt).toBe(1);
  });
});
