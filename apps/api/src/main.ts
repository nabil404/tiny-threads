import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load app-wise .env (apps/api/.env)
const envCandidates = [
  resolve(__dirname, '../.env'),
  resolve(__dirname, '../../.env'),
  resolve(process.cwd(), 'apps/api/.env'),
  resolve(process.cwd(), '.env'),
];
const envPath = envCandidates.find((p) => existsSync(p));
if (envPath) {
  config({ path: envPath });
}

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

  await app.listen(configService.get('PORT', { infer: true }) ?? 8000);
}
void bootstrap();
