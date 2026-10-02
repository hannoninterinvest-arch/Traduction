import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import express from 'express';
import helmet from 'helmet';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/exception.filter';
import { AppConfig } from './config/env';

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  const config = app.get(AppConfig);
  app.useLogger(app.get(Logger));
  app.use(helmet({ contentSecurityPolicy: config.nodeEnv === 'production' }));
  const server = app.getHttpAdapter().getInstance() as express.Express;
  server.use('/uploads/direct', express.raw({ type: '*/*', limit: config.maxUploadBytes }));
  server.use(express.json({ limit: '1mb' }));
  app.enableCors({
    origin: config.webOrigins,
    credentials: true,
    allowedHeaders: ['authorization', 'content-type', 'x-upload-path', 'x-upload-token'],
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('DocTranslate API')
        .setDescription('OCR, translation, and layout jobs. Files upload directly to storage.')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(AppConfig);
  await app.listen(config.port);
}

if (require.main === module) {
  void bootstrap();
}
