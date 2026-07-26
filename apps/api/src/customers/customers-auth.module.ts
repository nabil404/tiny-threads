import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { CustomersAuthController } from './customers-auth.controller';
import { CustomersAuthService } from './customers-auth.service';

@Module({
  imports: [AuthCoreModule],
  controllers: [CustomersAuthController],
  providers: [CustomersAuthService],
  exports: [CustomersAuthService],
})
export class CustomersAuthModule {}
