import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OneTimeCodeModule } from '../oauth/one-time-code.module';
import { MerchantAdminsAuthController } from './merchant-admins-auth.controller';
import { MerchantAdminsAuthService } from './merchant-admins-auth.service';
import { MerchantAdminLocalStrategy } from './strategies/merchant-admin-local.strategy';
import { MerchantAdminJwtStrategy } from './strategies/merchant-admin-jwt.strategy';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    AuthCoreModule,
    NotificationsModule,
    PassportModule,
    OneTimeCodeModule,
  ],
  controllers: [MerchantAdminsAuthController],
  providers: [
    MerchantAdminsAuthService,
    MerchantAdminLocalStrategy,
    MerchantAdminJwtStrategy,
    RolesGuard,
  ],
  exports: [MerchantAdminsAuthService],
})
export class MerchantAdminsAuthModule {}
