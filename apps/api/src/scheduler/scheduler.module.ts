import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../db/database.module';
import { OrdersModule } from '../orders/orders.module';
import { OrderExpiryService } from './jobs/order-expiry.service';
import { OrderExpiryJob } from './jobs/order-expiry.job';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, OrdersModule],
  providers: [OrderExpiryService, OrderExpiryJob],
})
export class SchedulerModule {}
