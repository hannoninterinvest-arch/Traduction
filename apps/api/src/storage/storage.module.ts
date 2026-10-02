import { Module } from '@nestjs/common';
import { AppConfig } from '../config/env';
import { MemoryStorage, OBJECT_STORAGE, SupabaseStorage } from './storage.service';

@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        config.dataDriver === 'supabase' ? new SupabaseStorage(config) : new MemoryStorage(config),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
