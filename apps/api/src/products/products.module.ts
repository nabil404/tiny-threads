import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { ProductsService } from './products.service';
import { CategoriesService } from './categories.service';
import { MerchantProductsController } from './merchant-products.controller';
import { MerchantCategoriesController } from './merchant-categories.controller';
import { StorefrontProductsController } from './storefront-products.controller';
import { StorefrontCategoriesController } from './storefront-categories.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [
    MerchantProductsController,
    MerchantCategoriesController,
    StorefrontProductsController,
    StorefrontCategoriesController,
  ],
  providers: [ProductsService, CategoriesService],
  exports: [ProductsService, CategoriesService],
})
export class ProductsModule {}
