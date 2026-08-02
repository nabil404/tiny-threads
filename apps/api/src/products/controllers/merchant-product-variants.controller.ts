import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MerchantAdminJwtAuthGuard } from '../../merchant-admins/guards/merchant-admin-jwt-auth.guard';
import { RolesGuard } from '../../merchant-admins/guards/roles.guard';
import { Roles } from '../../merchant-admins/decorators/roles.decorator';
import { ProductsService } from '../services/products.service';
import { CreateProductVariantDto } from '../dto/create-product-variant.dto';
import { UpdateProductVariantDto } from '../dto/update-product-variant.dto';

@ApiTags('Merchant Product Variants')
@ApiBearerAuth()
@Controller('merchant-admins/products/:productId/variants')
@UseGuards(MerchantAdminJwtAuthGuard)
export class MerchantProductVariantsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({
    summary: 'Add variant to product',
    description: 'Creates a new variant under the specified product.',
  })
  @ApiResponse({ status: 201, description: 'Variant created successfully.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @ApiResponse({ status: 409, description: 'SKU already exists.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  create(
    @Param('productId') productId: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.productsService.createVariant(productId, dto);
  }

  @ApiOperation({
    summary: 'List product variants',
    description: 'Retrieves all variants belonging to the specified product.',
  })
  @ApiResponse({ status: 200, description: 'List of variants.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @Get()
  findAll(@Param('productId') productId: string) {
    return this.productsService.findVariantsByProduct(productId);
  }

  @ApiOperation({
    summary: 'Get single variant',
    description: 'Retrieves a single product variant by ID.',
  })
  @ApiResponse({ status: 200, description: 'Variant found.' })
  @ApiResponse({ status: 404, description: 'Variant not found.' })
  @Get(':variantId')
  findOne(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.productsService.findVariantById(productId, variantId);
  }

  @ApiOperation({
    summary: 'Update single variant',
    description:
      'Updates price, stock, SKU, or default status of a single variant.',
  })
  @ApiResponse({ status: 200, description: 'Variant updated successfully.' })
  @ApiResponse({ status: 404, description: 'Variant not found.' })
  @ApiResponse({ status: 409, description: 'SKU already exists.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Patch(':variantId')
  update(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.productsService.updateVariant(productId, variantId, dto);
  }

  @ApiOperation({
    summary: 'Delete single variant',
    description:
      'Deletes a single variant. Auto-promotes another variant if deleting default variant.',
  })
  @ApiResponse({ status: 204, description: 'Variant deleted successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete only variant of product.',
  })
  @ApiResponse({ status: 404, description: 'Variant not found.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Delete(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
  ) {
    await this.productsService.deleteVariant(productId, variantId);
  }
}
