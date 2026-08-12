import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OneTimeCodeModule } from '../oauth/one-time-code.module';
import { CustomersAuthController } from './customers-auth.controller';
import { CustomersAuthService } from './customers-auth.service';
import { CustomerLocalStrategy } from './strategies/customer-local.strategy';
import { CustomerJwtStrategy } from './strategies/customer-jwt.strategy';

import { StorageModule } from '../storage/storage.module';
import { CustomersAvatarController } from './customers-avatar.controller';
import { CustomersAvatarService } from './customers-avatar.service';

@Module({
  imports: [
    AuthCoreModule,
    NotificationsModule,
    PassportModule,
    OneTimeCodeModule,
    StorageModule,
  ],
  controllers: [CustomersAuthController, CustomersAvatarController],
  providers: [
    CustomersAuthService,
    CustomersAvatarService,
    CustomerLocalStrategy,
    CustomerJwtStrategy,
  ],
  exports: [CustomersAuthService, CustomersAvatarService],
})
export class CustomersAuthModule {}
