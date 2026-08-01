import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { PaymentsModule } from '../payments/payments.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [DatabaseModule, TenantSettingsModule, PaymentsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
