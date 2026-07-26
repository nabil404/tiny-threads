import { Module } from '@nestjs/common';
import { OneTimeCodeService } from './one-time-code.service';

// Split out from OAuthModule so it can be imported by both OAuthModule
// (GoogleOAuthController issues codes) and CustomersAuthModule (its
// controller redeems them) — and, from Task 14 on, MerchantAdminsAuthModule
// too — without CustomersAuthModule/MerchantAdminsAuthModule having to
// import OAuthModule itself, which would create a module import cycle
// (OAuthModule already imports CustomersAuthModule).
@Module({
  providers: [OneTimeCodeService],
  exports: [OneTimeCodeService],
})
export class OneTimeCodeModule {}
