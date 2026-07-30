import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { buildValidationException } from './common/errors/validation-field';

export function configureApp(app: INestApplication): void {
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: buildValidationException,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
