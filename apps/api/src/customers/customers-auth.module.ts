import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OneTimeCodeModule } from '../oauth/one-time-code.module';
import { CustomersAuthController } from './customers-auth.controller';
import { CustomersAuthService } from './customers-auth.service';
import { CustomerLocalStrategy } from './strategies/customer-local.strategy';
import { CustomerJwtStrategy } from './strategies/customer-jwt.strategy';

@Module({
  imports: [
    AuthCoreModule,
    NotificationsModule,
    PassportModule,
    OneTimeCodeModule,
  ],
  controllers: [CustomersAuthController],
  providers: [CustomersAuthService, CustomerLocalStrategy, CustomerJwtStrategy],
  exports: [CustomersAuthService],
})
export class CustomersAuthModule {}
