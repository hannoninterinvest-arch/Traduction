import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { AppConfig } from '../config/env';
import { JOB_REPOSITORY } from './job.repository';
import { MemoryJobRepository } from './memory.repository';
import { POSTGRES_POOL } from './postgres.module';
import { PostgresJobRepository } from './postgres.repository';
import { SupabaseJobRepository } from './supabase.repository';

@Module({
  providers: [
    {
      provide: JOB_REPOSITORY,
      inject: [AppConfig, POSTGRES_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) => {
        if (config.dataDriver === 'supabase') return new SupabaseJobRepository(config);
        if (config.dataDriver === 'postgres') {
          if (!pool) throw new Error('Postgres pool was not created');
          return new PostgresJobRepository(pool);
        }
        return new MemoryJobRepository();
      },
    },
  ],
  exports: [JOB_REPOSITORY],
})
export class DatabaseModule {}
