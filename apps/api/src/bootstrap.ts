import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { buildValidationException } from './common/errors/validation-field';
import { API_PREFIX, API_VERSION } from './common/constants';

export function configureApp(app: INestApplication): void {
  // admin-web needs credentialed cross-origin requests (httpOnly refresh
  // cookie + Authorization header) — without this, no browser fetch from
  // the admin SPA's origin can reach the API at all.
  app.enableCors({
    origin: [process.env.ADMIN_WEB_ORIGIN ?? 'http://localhost:3000'],
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: buildValidationException,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // Root ('/') and the Google OAuth callback are excluded from the prefix so
  // their paths stay exactly as before: '/' is hit by health probes with no
  // registered tenant host, and Google is only ever given one registered
  // redirect_uri (see GoogleOAuthController) — prefixing it would require a
  // Google Cloud Console change in lockstep with a deploy. Both routes also
  // opt out of versioning itself via `version: VERSION_NEUTRAL`.
  //
  // method: RequestMethod.ALL (not GET) is deliberate and load-bearing: Nest
  // reuses this same exclude list to decide which paths a *wildcard* global
  // middleware (forRoutes('*')) should still cover unprefixed — including
  // nestjs-cls's own ClsMiddleware, which on Express 5 mounts at the literal
  // path '/'. That match is method-sensitive; GET wouldn't match ClsMiddleware's
  // internal ALL-method route entry, so '/' would silently start requiring the
  // '/api' prefix to get an async-local-storage context at all, and anything
  // outside '/api' (this OAuth callback included) would 500 on the first
  // ClsService#set call instead of 404ing or working normally.
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: '/', method: RequestMethod.ALL },
      { path: 'auth/google/callback', method: RequestMethod.ALL },
    ],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  });
}
