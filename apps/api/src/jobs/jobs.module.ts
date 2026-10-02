import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PipelineService } from '../pipeline/pipeline.service';
import { OcrEngine, TranslationEngine } from '../providers/engines';
import { StorageModule } from '../storage/storage.module';
import { JobWorker } from './job.worker';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [JobsController],
  providers: [JobsService, JobWorker, PipelineService, OcrEngine, TranslationEngine],
  exports: [JobsService, JobWorker],
})
export class JobsModule {}
