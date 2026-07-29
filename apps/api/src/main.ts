import { config } from 'dotenv';
import { resolve } from 'path';

// Repo root is three levels up from this file's directory, both from src/
// (apps/api/src) when run via ts-node and from dist/ (apps/api/dist) after a
// build. data-source.ts needs four because it sits one level deeper (src/db).
config({ path: resolve(__dirname, '../../../.env') });

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module';
import { EnvironmentVariables } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const configService = app.get<ConfigService<EnvironmentVariables, true>>(
    ConfigService,
  );
  await app.listen(configService.get('PORT', { infer: true }) ?? 3000);
}
void bootstrap();
