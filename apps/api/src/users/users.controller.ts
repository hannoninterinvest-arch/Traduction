import { Body, Controller, Delete, Get, Inject, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { isKnownLanguage, updatePreferencesSchema } from '@doctranslate/shared';
import { AppException } from '../common/app.exception';
import { CurrentUser, type AuthUser } from '../common/auth';
import { JOB_REPOSITORY, type JobRepository } from '../database/job.repository';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.service';

@ApiTags('account')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobs: JobRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const preferences = await this.jobs.getPreferences(user.id);
    return { id: user.id, email: user.email, preferences };
  }

  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = updatePreferencesSchema.parse(body);
    if (!isKnownLanguage(input.defaultTargetLang) || input.defaultTargetLang === 'auto') {
      throw new AppException('VALIDATION', 'Choose a supported target language.', 400);
    }
    const preferences = {
      userId: user.id,
      defaultTargetLang: input.defaultTargetLang,
      updatedAt: new Date().toISOString(),
    };
    await this.jobs.savePreferences(preferences);
    return preferences;
  }

  @Delete()
  async erase(@CurrentUser() user: AuthUser) {
    const paths = await this.jobs.deleteUserData(user.id);
    for (const path of paths) await this.storage.remove(path);
    await this.jobs.appendAudit({
      jobId: null,
      userId: user.id,
      action: 'account.erased',
      timestamp: new Date().toISOString(),
      metadata: { files: paths.length },
    });
    return {
      ok: true,
      filesRemoved: paths.length,
      message:
        'Documents and preferences were deleted. Integrity hashes stay in the append-only log without document text.',
    };
  }
}
