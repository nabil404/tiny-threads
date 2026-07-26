import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HashingService } from './hashing.service';
import { TokenService } from './token.service';
import { OAuthStateService } from './oauth-state.service';
import { NOTIFICATIONS_PORT } from './notifications/notifications-port';
import { LogNotificationsAdapter } from './notifications/log-notifications.adapter';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET is not set');
        }
        return { secret };
      },
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
