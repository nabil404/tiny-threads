import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductQueryDto } from '../dto/product-query.dto';

@ApiTags('Merchant Products')
@ApiBearerAuth()
@Controller('merchant-admins/products')
@UseGuards(MerchantAdminJwtAuthGuard)
export class MerchantProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({
    summary: 'Create a new product',
    description:
      'Creates a new product with options, variants, and categories.',
  })
  @ApiResponse({ status: 201, description: 'Product created successfully.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @ApiOperation({
    summary: 'List merchant products',
    description: 'Returns a paginated list of products including drafts.',
  })
  @ApiResponse({ status: 200, description: 'Paginated product list.' })
  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query, false);
  }

  @ApiOperation({
    summary: 'Get product by ID',
    description: 'Retrieves a single product by ID.',
  })
  @ApiResponse({ status: 200, description: 'Product found.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findById(id, false);
  }

  @ApiOperation({
    summary: 'Update product',
    description: 'Updates product details, options, variants, or categories.',
  })
  @ApiResponse({ status: 200, description: 'Product updated successfully.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @ApiOperation({
    summary: 'Delete product',
    description: 'Deletes a product and its options and variants.',
  })
  @ApiResponse({ status: 204, description: 'Product deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  @UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.productsService.delete(id);
  }
}
