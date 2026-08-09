import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { MerchantAdminLocaleController } from './merchant-admin-locale.controller';
import { MerchantAdminLocaleService } from './merchant-admin-locale.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MerchantAdminLocaleController],
  providers: [MerchantAdminLocaleService],
})
export class MerchantAdminLocaleModule {}
