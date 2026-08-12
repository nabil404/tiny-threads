import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MerchantAdminJwtAuthGuard } from '../../merchant-admins/guards/merchant-admin-jwt-auth.guard';
import { RolesGuard } from '../../merchant-admins/guards/roles.guard';
import { Roles } from '../../merchant-admins/decorators/roles.decorator';
import { ProductVariantImagesService } from '../services/product-variant-images.service';
import { CreateProductVariantImageDto } from '../dto/create-product-variant-image.dto';
import { UpdateProductVariantImageDto } from '../dto/update-product-variant-image.dto';
import { ReorderProductVariantImagesDto } from '../dto/reorder-product-variant-images.dto';

@ApiTags('Merchant Product Variant Images')
@ApiBearerAuth()
@Controller('merchant-admins/products/:productId/variants/:variantId/images')
@UseGuards(MerchantAdminJwtAuthGuard)
export class MerchantProductVariantImagesController {
  constructor(
    private readonly productVariantImagesService: ProductVariantImagesService,
  ) {}

  @ApiOperation({
    summary: 'Upload product variant image',
    description: 'Uploads and processes an image for a product variant.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Image uploaded successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid image file or payload.' })
  @ApiResponse({ status: 404, description: 'Product variant not found.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadImage(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body() dto?: CreateProductVariantImageDto,
  ) {
    return this.productVariantImagesService.uploadImage(
      productId,
      variantId,
      file,
      dto,
    );
  }

  @ApiOperation({
    summary: 'List product variant images',
    description:
      'Retrieves all images for a product variant ordered by sortOrder.',
  })
  @ApiResponse({ status: 200, description: 'List of variant images.' })
  @ApiResponse({ status: 404, description: 'Product variant not found.' })
  @Get()
  listImages(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.productVariantImagesService.listImages(productId, variantId);
  }

  @ApiOperation({
    summary: 'Reorder product variant images',
    description:
      'Atomically updates the sort order for all variant images passed.',
  })
  @ApiResponse({ status: 200, description: 'Images reordered successfully.' })
  @ApiResponse({
    status: 404,
    description: 'Product variant or image not found.',
  })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Put('reorder')
  reorderImages(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: ReorderProductVariantImagesDto,
  ) {
    return this.productVariantImagesService.reorderImages(
      productId,
      variantId,
      dto,
    );
  }

  @ApiOperation({
    summary: 'Update product variant image',
    description: 'Updates alt text, primary status, or sort order of an image.',
  })
  @ApiResponse({ status: 200, description: 'Image updated successfully.' })
  @ApiResponse({
    status: 404,
    description: 'Product variant or image not found.',
  })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Patch(':imageId')
  updateImage(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Param('imageId') imageId: string,
    @Body() dto: UpdateProductVariantImageDto,
  ) {
    return this.productVariantImagesService.updateImage(
      productId,
      variantId,
      imageId,
      dto,
    );
  }

  @ApiOperation({
    summary: 'Delete product variant image',
    description:
      'Deletes a variant image. Auto-promotes the next image to primary if deleted image was primary.',
  })
  @ApiResponse({ status: 204, description: 'Image deleted successfully.' })
  @ApiResponse({
    status: 404,
    description: 'Product variant or image not found.',
  })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Delete(':imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Param('imageId') imageId: string,
  ): Promise<void> {
    await this.productVariantImagesService.deleteImage(
      productId,
      variantId,
      imageId,
    );
  }
}
