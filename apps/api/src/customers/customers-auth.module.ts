import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { CustomersAuthController } from './customers-auth.controller';
import { CustomersAuthService } from './customers-auth.service';
import { CustomerLocalStrategy } from './customer-local.strategy';
import { CustomerJwtStrategy } from './customer-jwt.strategy';

@Module({
  imports: [AuthCoreModule, PassportModule],
  controllers: [CustomersAuthController],
  providers: [CustomersAuthService, CustomerLocalStrategy, CustomerJwtStrategy],
  exports: [CustomersAuthService],
})
export class CustomersAuthModule {}
