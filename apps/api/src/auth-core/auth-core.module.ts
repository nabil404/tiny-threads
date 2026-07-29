import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { HashingService } from './hashing.service';
import { TokenService } from './token.service';
import { OAuthStateService } from './oauth-state.service';
import { NOTIFICATIONS_PORT } from './notifications/notifications-port';
import { LogNotificationsAdapter } from './notifications/log-notifications.adapter';
import { EnvironmentVariables } from '../config/env.validation';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ) => ({
        secret: configService.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  providers: [
    HashingService,
    TokenService,
    OAuthStateService,
    { provide: NOTIFICATIONS_PORT, useClass: LogNotificationsAdapter },
  ],
  exports: [
    JwtModule,
    HashingService,
    TokenService,
    OAuthStateService,
    NOTIFICATIONS_PORT,
  ],
})
export class AuthCoreModule {}
