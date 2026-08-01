import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderExpiryService } from './order-expiry.service';

@Injectable()
export class OrderExpiryJob {
  private readonly logger = new Logger(OrderExpiryJob.name);

  constructor(private readonly orderExpiryService: OrderExpiryService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiry(): Promise<void> {
    this.logger.log('Running order expiry check...');
    await this.orderExpiryService.expireStaleOrders();
    this.logger.log('Order expiry check complete.');
  }
}
