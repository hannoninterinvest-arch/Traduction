import { Global, Module } from '@nestjs/common';
import { AppConfig } from './env';

@Global()
@Module({
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
