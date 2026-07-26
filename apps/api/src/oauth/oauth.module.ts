import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { CustomersAuthModule } from '../customers/customers-auth.module';
import { GoogleOAuthController } from './google-oauth.controller';
import { OneTimeCodeModule } from './one-time-code.module';

@Module({
  imports: [AuthCoreModule, CustomersAuthModule, OneTimeCodeModule],
  controllers: [GoogleOAuthController],
})
export class OAuthModule {}
