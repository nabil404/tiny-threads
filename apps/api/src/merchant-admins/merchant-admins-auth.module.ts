import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { MerchantAdminsAuthController } from './merchant-admins-auth.controller';
import { MerchantAdminsAuthService } from './merchant-admins-auth.service';
import { MerchantAdminLocalStrategy } from './merchant-admin-local.strategy';
import { MerchantAdminJwtStrategy } from './merchant-admin-jwt.strategy';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [AuthCoreModule, PassportModule],
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
