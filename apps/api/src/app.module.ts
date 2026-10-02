import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { CleanupService } from './cleanup/cleanup.service';
import { AuthGuard } from './common/auth.guard';
import { UserThrottlerGuard } from './common/throttler.guard';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { IntegrityModule } from './integrity/integrity.module';
import { JobsModule } from './jobs/jobs.module';
import { MetricsModule } from './metrics/metrics.module';
import { StorageController } from './storage/storage.controller';
import { StorageModule } from './storage/storage.module';
import { UploadsController } from './uploads/uploads.controller';
import { UsersController } from './users/users.controller';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body'],
        autoLogging: {
          ignore: (req) => req.url === '/health' || req.url === '/wake' || req.url === '/metrics',
        },
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    StorageModule,
    MetricsModule,
    IntegrityModule,
    JobsModule,
  ],
  controllers: [HealthController, UploadsController, UsersController, StorageController],
  providers: [
    CleanupService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
