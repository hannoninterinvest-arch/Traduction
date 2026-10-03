import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { verifyAuditChain, verifyHashSchema } from '@doctranslate/shared';
import { JOB_REPOSITORY, type JobRepository } from '../database/job.repository';
import { AnchorService } from './anchor.service';

const sha256 = (payload: string) => createHash('sha256').update(payload).digest('hex');

@Injectable()
export class IntegrityService {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobs: JobRepository,
    private readonly anchor: AnchorService,
  ) {}

  async verify(userId: string, body: unknown) {
    const { hash } = verifyHashSchema.parse(body);
    const matches = await this.jobs.findByContentHash(userId, hash);
    return { match: matches.length > 0, hash: hash.toLowerCase(), matches };
  }

  async audit(userId: string) {
    const entries = await this.jobs.listAuditForUser(userId);
    const chain = verifyAuditChain(entries, sha256);
    return { entries, valid: chain.ok, brokenAt: chain.ok ? null : chain.brokenAt };
  }

  async anchorLatest(userId: string) {
    const entries = await this.jobs.listAuditForUser(userId);
    const latest = entries[entries.length - 1];
    if (!latest) return { anchored: false, txHash: null, hash: null };
    const result = await this.anchor.anchor(latest.hash);
    return { ...result, hash: latest.hash };
  }
}
