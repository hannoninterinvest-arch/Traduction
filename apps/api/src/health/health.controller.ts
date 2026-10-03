import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { LANGUAGES } from '@doctranslate/shared';
import { Public } from '../common/auth';
import { MetricsService } from '../metrics/metrics.service';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('health')
  health() {
    return { status: 'ok', uptimeSec: this.metrics.snapshot().uptimeSec };
  }

  @Get('wake')
  wake() {
    return { ok: true, ts: new Date().toISOString() };
  }

  @Get('metrics')
  metricsSnapshot() {
    return this.metrics.snapshot();
  }

  @Get('languages')
  languages() {
    return LANGUAGES;
  }
}
