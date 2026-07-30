import { config } from 'dotenv';
import { resolve } from 'path';

// Repo root is three levels up from this file's directory, both from src/
// (apps/api/src) when run via ts-node and from dist/ (apps/api/dist) after a
// build. data-source.ts needs four because it sits one level deeper (src/db).
config({ path: resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { EnvironmentVariables, NodeEnv } from './config/env.validation';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const configService =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  if (configService.get('NODE_ENV', { infer: true }) !== NodeEnv.Production) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Tiny Threads API')
        .setDescription('Multi-tenant e-commerce marketplace API')
        .setVersion('0.0.1')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(configService.get('PORT', { infer: true }) ?? 3000);
}
void bootstrap();
