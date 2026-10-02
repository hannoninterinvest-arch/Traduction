import { Module } from '@nestjs/common';
import { AppConfig } from '../config/env';
import { JOB_REPOSITORY } from './job.repository';
import { MemoryJobRepository } from './memory.repository';
import { SupabaseJobRepository } from './supabase.repository';

@Module({
  providers: [
    {
      provide: JOB_REPOSITORY,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        config.dataDriver === 'supabase'
          ? new SupabaseJobRepository(config)
          : new MemoryJobRepository(),
    },
  ],
  exports: [JOB_REPOSITORY],
})
export class DatabaseModule {}
