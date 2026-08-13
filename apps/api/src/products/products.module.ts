import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { StorageModule } from '../storage/storage.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { ProductsService } from './services/products.service';
import { CategoriesService } from './services/categories.service';
import { ProductVariantImagesService } from './services/product-variant-images.service';
import { MerchantProductsController } from './controllers/merchant-products.controller';
import { MerchantProductVariantsController } from './controllers/merchant-product-variants.controller';
import { MerchantProductVariantImagesController } from './controllers/merchant-product-variant-images.controller';
import { MerchantCategoriesController } from './controllers/merchant-categories.controller';
import { StorefrontProductsController } from './controllers/storefront-products.controller';
import { StorefrontCategoriesController } from './controllers/storefront-categories.controller';

@Module({
  imports: [DatabaseModule, StorageModule, TenantSettingsModule],
  controllers: [
    MerchantProductsController,
    MerchantProductVariantsController,
    MerchantProductVariantImagesController,
    MerchantCategoriesController,
    StorefrontProductsController,
    StorefrontCategoriesController,
  ],
  providers: [ProductsService, CategoriesService, ProductVariantImagesService],
  exports: [ProductsService, CategoriesService, ProductVariantImagesService],
})
export class ProductsModule {}
