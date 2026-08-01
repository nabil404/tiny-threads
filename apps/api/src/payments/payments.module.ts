import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PAYMENT_PROVIDER_TOKEN } from './interfaces/payment-provider.interface';

@Module({
  imports: [DatabaseModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER_TOKEN,
      useClass: MockPaymentProvider,
    },
  ],
  exports: [PaymentsService, PAYMENT_PROVIDER_TOKEN],
})
export class PaymentsModule {}
