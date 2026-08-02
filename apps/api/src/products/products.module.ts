import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { ProductsService } from './services/products.service';
import { CategoriesService } from './services/categories.service';
import { MerchantProductsController } from './controllers/merchant-products.controller';
import { MerchantProductVariantsController } from './controllers/merchant-product-variants.controller';
import { MerchantCategoriesController } from './controllers/merchant-categories.controller';
import { StorefrontProductsController } from './controllers/storefront-products.controller';
import { StorefrontCategoriesController } from './controllers/storefront-categories.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [
    MerchantProductsController,
    MerchantProductVariantsController,
    MerchantCategoriesController,
    StorefrontProductsController,
    StorefrontCategoriesController,
  ],
  providers: [ProductsService, CategoriesService],
  exports: [ProductsService, CategoriesService],
})
export class ProductsModule {}
