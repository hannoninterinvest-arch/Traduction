import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AnchorService } from './anchor.service';
import { IntegrityController } from './integrity.controller';
import { IntegrityService } from './integrity.service';

@Module({
  imports: [DatabaseModule],
  controllers: [IntegrityController],
  providers: [AnchorService, IntegrityService],
  exports: [AnchorService],
})
export class IntegrityModule {}
