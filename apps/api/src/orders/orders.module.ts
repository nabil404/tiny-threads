import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersService } from './orders.service';
import { CustomersOrdersController } from './controllers/customers-orders.controller';
import { GuestOrdersController } from './controllers/guest-orders.controller';
import { MerchantAdminsOrdersController } from './controllers/merchant-admins-orders.controller';

@Module({
  imports: [DatabaseModule, PaymentsModule],
  controllers: [
    CustomersOrdersController,
    GuestOrdersController,
    MerchantAdminsOrdersController,
  ],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
