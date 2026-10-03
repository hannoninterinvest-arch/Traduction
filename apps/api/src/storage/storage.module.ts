import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { AppConfig } from '../config/env';
import { POSTGRES_POOL } from '../database/postgres.module';
import { MemoryStorage, OBJECT_STORAGE, PostgresStorage, SupabaseStorage } from './storage.service';

@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [AppConfig, POSTGRES_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) => {
        if (config.dataDriver === 'supabase') return new SupabaseStorage(config);
        if (config.dataDriver === 'postgres') {
          if (!pool) throw new Error('Postgres pool was not created');
          return new PostgresStorage(config, pool);
        }
        return new MemoryStorage(config);
      },
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
